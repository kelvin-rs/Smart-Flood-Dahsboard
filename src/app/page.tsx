"use client";
import { useState, useEffect, useRef } from "react";
import mqtt from "mqtt";

// --- Definisi Tipe Data ---
interface DataSungai {
  level: number;
  status: "AMAN" | "SIAGA" | "BAHAYA" | "MENUNGGU DATA...";
}

interface DataPintuAir {
  levelLokal: number;
  bukaan: number;
  status: "AMAN" | "SIAGA" | "BAHAYA" | "MENUNGGU DATA...";
}

interface LogEntry {
  waktu: string;
  sungai: string;
  pintu: string;
  hujan: string;
  wilayah: string;
}

type KondisiHujan = "CERAH" | "GERIMIS" | "DERAS" | "MENUNGGU DATA...";
type StatusWilayah =
  | "AMAN"
  | "SIAGA"
  | "BAHAYA"
  | "DARURAT"
  | "MENYAMBUNGKAN...";

export default function DashboardKelurahan() {
  const [nodeSungai, setNodeSungai] = useState<DataSungai>({
    level: 0,
    status: "MENUNGGU DATA...",
  });
  const [nodePintuAir, setNodePintuAir] = useState<DataPintuAir>({
    levelLokal: 0,
    bukaan: 0,
    status: "MENUNGGU DATA...",
  });
  const [hujanLokal, setHujanLokal] =
    useState<KondisiHujan>("MENUNGGU DATA...");
  const [statusWilayah, setStatusWilayah] =
    useState<StatusWilayah>("MENYAMBUNGKAN...");
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const [client, setClient] = useState<mqtt.MqttClient | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const prevStatusRef = useRef<StatusWilayah>("MENYAMBUNGKAN...");

  // --- Fungsi Matriks Keputusan Internal ---
  const hitungStatusWilayah = (
    sungaiStatus: string,
    kondisiHujan: string,
  ): StatusWilayah => {
    if (
      sungaiStatus === "MENUNGGU DATA..." ||
      kondisiHujan === "MENUNGGU DATA..."
    )
      return "MENYAMBUNGKAN...";
    if (sungaiStatus === "BAHAYA" && kondisiHujan === "DERAS") return "DARURAT";
    if (
      sungaiStatus === "BAHAYA" ||
      (sungaiStatus === "SIAGA" && kondisiHujan === "DERAS")
    )
      return "BAHAYA";
    if (sungaiStatus === "SIAGA" || kondisiHujan === "DERAS") return "SIAGA";
    return "AMAN";
  };

  // --- Efek: Kalkulasi Status Wilayah & Auto-Alarm ---
  useEffect(() => {
    const statusBaru = hitungStatusWilayah(nodeSungai.status, hujanLokal);
    setStatusWilayah(statusBaru);

    // Logging & Trigger Alarm Fisik
    if (
      statusBaru !== "MENYAMBUNGKAN..." &&
      statusBaru !== prevStatusRef.current
    ) {
      const timestamp = new Date().toLocaleTimeString("id-ID");
      setLogs((prev) => [
        {
          waktu: timestamp,
          sungai: `${nodeSungai.level}cm (${nodeSungai.status})`,
          pintu: `${nodePintuAir.bukaan}% (${nodePintuAir.status})`,
          hujan: hujanLokal,
          wilayah: statusBaru,
        },
        ...prev.slice(0, 14),
      ]);

      prevStatusRef.current = statusBaru;

      // Publish perintah menyalakan/mematikan Buzzer di Node 3
      if (client && isConnected) {
        if (statusBaru === "DARURAT" || statusBaru === "BAHAYA") {
          client.publish("project-banjir/node3/alarm", "ON");
        } else {
          client.publish("project-banjir/node3/alarm", "OFF");
        }
      }
    }
  }, [
    nodeSungai.status,
    nodeSungai.level,
    hujanLokal,
    nodePintuAir.bukaan,
    nodePintuAir.status,
    client,
    isConnected,
  ]);

  // --- Efek: Koneksi MQTT ---
  useEffect(() => {
    const mqttClient = mqtt.connect("wss://broker.emqx.io:8084/mqtt", {
      clientId: `web-posko-${Math.random().toString(16).slice(3)}`,
      keepalive: 60,
    });

    mqttClient.on("connect", () => {
      setIsConnected(true);
      setClient(mqttClient);

      // Subscribe ke TOPIK BARU
      mqttClient.subscribe("project-banjir/node1/level-air");
      mqttClient.subscribe("project-banjir/node1/status");
      mqttClient.subscribe("project-banjir/node2/level-air");
      mqttClient.subscribe("project-banjir/node2/status-persentase");
      mqttClient.subscribe("project-banjir/node2/status");
      mqttClient.subscribe("project-banjir/node3/hujan");
    });

    mqttClient.on("message", (topic, message) => {
      const payload = message.toString();

      switch (topic) {
        case "project-banjir/node1/level-air":
          setNodeSungai((prev) => ({ ...prev, level: Number(payload) }));
          break;
        case "project-banjir/node1/status":
          setNodeSungai((prev) => ({
            ...prev,
            status: payload as DataSungai["status"],
          }));
          break;
        case "project-banjir/node2/level-air":
          setNodePintuAir((prev) => ({ ...prev, levelLokal: Number(payload) }));
          break;
        case "project-banjir/node2/status-persentase":
          setNodePintuAir((prev) => ({ ...prev, bukaan: Number(payload) }));
          break;
        case "project-banjir/node2/status":
          setNodePintuAir((prev) => ({
            ...prev,
            status: payload as DataPintuAir["status"],
          }));
          break;
        case "project-banjir/node3/hujan":
          setHujanLokal(payload as KondisiHujan);
          break;
      }
    });

    return () => {
      mqttClient.end();
    };
  }, []);

  // --- Fungsi Publish: Kontrol Pintu Air Manual ---
  const kontrolPintu = (persentase: number) => {
    if (client && isConnected) {
      // Mengirimkan persentase bukaan ke aktuator pintu air Node 2
      client.publish("project-banjir/node2/kontrol", persentase.toString());
    } else {
      alert("Broker belum terhubung!");
    }
  };

  // --- Utility Warna ---
  const getThemeColors = (status: StatusWilayah) => {
    if (status === "AMAN")
      return "bg-emerald-500 text-white shadow-emerald-500/40";
    if (status === "SIAGA")
      return "bg-yellow-400 text-slate-800 shadow-yellow-400/40";
    if (status === "BAHAYA")
      return "bg-orange-500 text-white shadow-orange-500/40";
    if (status === "DARURAT")
      return "bg-red-600 animate-pulse text-white shadow-red-600/40";
    return "bg-slate-200 text-slate-500";
  };

  const getBadgeColor = (status: string) => {
    if (status === "AMAN" || status === "CERAH")
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    if (status === "SIAGA" || status === "GERIMIS")
      return "bg-yellow-100 text-yellow-700 border-yellow-200";
    if (status === "BAHAYA" || status === "DERAS")
      return "bg-red-100 text-red-700 border-red-200";
    return "bg-slate-100 text-slate-500 border-slate-200";
  };

  return (
    <main className="min-h-screen bg-slate-100 text-slate-800 p-6 md:p-10 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header & Status Koneksi */}
        <header className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Posko Wilayah</h1>
            <p className="text-sm font-medium text-slate-500">
              Sistem Deteksi Banjir & Pintu Air Otomatis
            </p>
          </div>
          <div
            className={`px-4 py-2 rounded-lg font-semibold text-sm flex items-center gap-2 ${isConnected ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}
          >
            <span
              className={`w-2.5 h-2.5 rounded-full ${isConnected ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`}
            ></span>
            {isConnected ? "Broker Terhubung" : "Menyambungkan..."}
          </div>
        </header>

        {/* Hero Banner: Status Wilayah */}
        <section
          className={`p-8 rounded-2xl shadow-lg text-center transition-all duration-500 ${getThemeColors(statusWilayah)}`}
        >
          <h2 className="text-xl font-bold opacity-90 mb-2 uppercase tracking-wider">
            Status Wilayah Kelurahan
          </h2>
          <div className="text-6xl font-black drop-shadow-md">
            {statusWilayah}
          </div>
          {statusWilayah === "DARURAT" && (
            <p className="mt-4 font-bold text-lg bg-white/20 inline-block px-6 py-2 rounded-full backdrop-blur-sm">
              ⚠️ ALARM PERINGATAN WARGA AKTIF!
            </p>
          )}
        </section>

        {/* Grid Monitor Nodes */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Node 1 */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden">
            <h3 className="font-bold border-b pb-3 mb-4 text-slate-700 flex items-center justify-between">
              <span>🌊 Node 1: Hulu</span>
            </h3>
            <div className="space-y-4">
              <div>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">
                  Level Air Hulu
                </p>
                <p className="text-4xl font-black text-slate-800">
                  {nodeSungai.level}{" "}
                  <span className="text-lg text-slate-500 font-medium">cm</span>
                </p>
              </div>
              <div>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
                  Status Air Hulu
                </p>
                <span
                  className={`px-3 py-1 rounded font-bold text-sm border inline-block ${getBadgeColor(nodeSungai.status)}`}
                >
                  {nodeSungai.status}
                </span>
              </div>
            </div>
          </div>

          {/* Node 2 - Kontrol & Sensor */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 relative">
            <h3 className="font-bold border-b pb-3 mb-4 text-slate-700 flex justify-between items-center">
              <span>⚙️ Node 2: Pintu Air</span>
              <span className="bg-blue-100 text-blue-700 text-[10px] px-2 py-1 rounded font-bold tracking-wider">
                2-WAY DATA
              </span>
            </h3>

            <div className="grid grid-cols-2 gap-4 mb-5">
              <div>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">
                  Bukaan
                </p>
                <p className="text-3xl font-black text-slate-800">
                  {nodePintuAir.bukaan}%
                </p>
              </div>
              <div>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">
                  Level Lokal
                </p>
                <p className="text-3xl font-black text-slate-800">
                  {nodePintuAir.levelLokal} <span className="text-sm">cm</span>
                </p>
              </div>
            </div>

            <div className="mb-5">
              <span
                className={`px-2 py-1 text-xs font-bold rounded border ${getBadgeColor(nodePintuAir.status)}`}
              >
                Status Lokal: {nodePintuAir.status}
              </span>
            </div>

            {/* Panel Publish Perintah */}
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 mb-2 uppercase text-center tracking-widest">
                Kirim Perintah Aktuator
              </p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => kontrolPintu(0)}
                  className="bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold py-2 rounded transition"
                >
                  TUTUP 0%
                </button>
                <button
                  onClick={() => kontrolPintu(50)}
                  className="bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 text-xs font-bold py-2 rounded transition"
                >
                  BUKA 50%
                </button>
                <button
                  onClick={() => kontrolPintu(100)}
                  className="bg-red-50 border border-red-200 hover:bg-red-100 text-red-700 text-xs font-bold py-2 rounded transition"
                >
                  FULL 100%
                </button>
              </div>
            </div>
          </div>

          {/* Node 3 */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h3 className="font-bold border-b pb-3 mb-4 text-slate-700">
              <span>🌧️ Node 3: Posko Lokal</span>
            </h3>
            <div className="space-y-4">
              <div>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
                  Sensor Hujan (Rain Module)
                </p>
                <span
                  className={`px-3 py-1 rounded font-bold text-sm border inline-block ${getBadgeColor(hujanLokal)}`}
                >
                  {hujanLokal}
                </span>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
                  Buzzer Peringatan Warga
                </p>
                <div
                  className={`py-3 px-4 rounded-lg text-center font-bold text-sm transition-colors ${statusWilayah === "DARURAT" || statusWilayah === "BAHAYA" ? "bg-red-100 text-red-700 border border-red-200" : "bg-slate-50 text-slate-400 border border-slate-100"}`}
                >
                  {statusWilayah === "DARURAT" || statusWilayah === "BAHAYA"
                    ? "🔊 MENGIRIM SINYAL 'ON'"
                    : "🔇 MENGIRIM SINYAL 'OFF'"}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabel Data Logging */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-1">
          <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
            <h3 className="font-bold text-slate-700">
              Riwayat Kejadian Sistem
            </h3>
            <span className="text-xs font-bold bg-slate-200 text-slate-500 px-2 py-1 rounded">
              LOGGING
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 text-sm">
                  <th className="p-4 font-semibold">Waktu</th>
                  <th className="p-4 font-semibold">Data Hulu</th>
                  <th className="p-4 font-semibold">Data Pintu Air</th>
                  <th className="p-4 font-semibold">Curah Hujan</th>
                  <th className="p-4 font-semibold">Status Wilayah</th>
                </tr>
              </thead>
              <tbody className="text-sm text-slate-600">
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400">
                      Menunggu perubahan status data...
                    </td>
                  </tr>
                )}
                {logs.map((log, idx) => (
                  <tr
                    key={idx}
                    className="border-b border-slate-50 hover:bg-slate-50/50 transition"
                  >
                    <td className="p-4 font-medium text-slate-400">
                      {log.waktu}
                    </td>
                    <td className="p-4 font-medium">{log.sungai}</td>
                    <td className="p-4 font-medium">{log.pintu}</td>
                    <td className="p-4 font-medium">{log.hujan}</td>
                    <td className="p-4 font-bold">
                      <span
                        className={`px-2 py-1 text-xs rounded border ${getBadgeColor(log.wilayah)}`}
                      >
                        {log.wilayah}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
