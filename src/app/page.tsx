"use client";
import { useState, useEffect, useRef } from "react";
import mqtt from "mqtt";
import { Plus_Jakarta_Sans } from "next/font/google";
import {
  Waves,
  Settings2,
  CloudRain,
  ShieldCheck,
  AlertTriangle,
  ShieldAlert,
  Power,
  BellRing,
  BellOff,
  Radio,
} from "lucide-react";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"] });

// --- Definisi Tipe Data Sesuai Laporan ---
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

type KondisiHujan = "CERAH" | "GERIMIS" | "HUJAN DERAS" | "MENUNGGU DATA...";
// Status disesuaikan menjadi 3 tingkatan sesuai laporan
type StatusWilayah = "AMAN" | "SIAGA" | "BAHAYA" | "MENYAMBUNGKAN...";

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

  // --- Logika Penentuan Status Wilayah ---
  const hitungStatusWilayah = (
    sungaiStatus: string,
    kondisiHujan: string,
  ): StatusWilayah => {
    if (
      sungaiStatus === "MENUNGGU DATA..." ||
      kondisiHujan === "MENUNGGU DATA..."
    )
      return "MENYAMBUNGKAN...";

    // Level Tertinggi adalah BAHAYA
    if (
      sungaiStatus === "BAHAYA" ||
      (sungaiStatus === "SIAGA" && kondisiHujan === "HUJAN DERAS")
    )
      return "BAHAYA";
    if (sungaiStatus === "SIAGA" || kondisiHujan === "HUJAN DERAS") return "SIAGA";
    return "AMAN";
  };

  useEffect(() => {
    const statusBaru = hitungStatusWilayah(nodeSungai.status, hujanLokal);
    setStatusWilayah(statusBaru);

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

      // Publish Alarm Virtual berdasarkan Status Tertinggi (BAHAYA)
      if (client && isConnected) {
        if (statusBaru === "BAHAYA") {
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

  // --- Koneksi & Subscribe Topik MQTT Sesuai Ketentuan ---
  useEffect(() => {
    const mqttClient = mqtt.connect("wss://broker.emqx.io:8084/mqtt", {
      clientId: `web-posko-${Math.random().toString(16).slice(3)}`,
      keepalive: 60,
    });

    mqttClient.on("connect", () => {
      setIsConnected(true);
      setClient(mqttClient);

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

  const kontrolPintu = (persentase: number) => {
    if (client && isConnected) {
      client.publish("project-banjir/node2/kontrol", persentase.toString());
    } else {
      alert("Broker belum terhubung!");
    }
  };

  // --- Konfigurasi 3D Theme Dinamis ---
  const getStatusVisuals = (status: StatusWilayah) => {
    switch (status) {
      case "AMAN":
        return {
          cardBg: "bg-gradient-to-br from-emerald-400 to-teal-500",
          shadow: "shadow-[0_15px_40px_rgba(16,185,129,0.3)]",
          icon: (
            <ShieldCheck className="w-10 h-10 md:w-12 md:h-12 text-white drop-shadow-md animate-pulse" />
          ),
        };
      case "SIAGA":
        return {
          cardBg: "bg-gradient-to-br from-amber-400 to-orange-400",
          shadow: "shadow-[0_15px_40px_rgba(245,158,11,0.3)]",
          icon: (
            <AlertTriangle className="w-10 h-10 md:w-12 md:h-12 text-white drop-shadow-md animate-bounce" />
          ),
        };
      case "BAHAYA":
        return {
          cardBg: "bg-gradient-to-br from-red-500 to-rose-600",
          shadow: "shadow-[0_15px_40px_rgba(225,29,72,0.5)] animate-pulse",
          icon: (
            <ShieldAlert className="w-10 h-10 md:w-12 md:h-12 text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.8)]" />
          ),
        };
      default:
        return {
          cardBg: "bg-gradient-to-br from-slate-300 to-slate-400",
          shadow: "shadow-[0_15px_40px_rgba(148,163,184,0.2)]",
          icon: (
            <Power className="w-10 h-10 md:w-12 md:h-12 text-white drop-shadow-md" />
          ),
        };
    }
  };

  const currentVisual = getStatusVisuals(statusWilayah);

  return (
    <main
      className={`min-h-screen bg-[#e8eff5] text-slate-800 p-4 sm:p-6 md:p-10 ${jakarta.className} overflow-hidden relative`}
    >
      {/* --- Ornamen 3D Background --- */}
      <div className="absolute top-[-10%] left-[-10%] w-[40rem] h-[40rem] bg-blue-400/20 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-5%] w-[35rem] h-[35rem] bg-indigo-400/20 rounded-full blur-3xl pointer-events-none"></div>

      <div className="max-w-7xl mx-auto space-y-6 md:space-y-8 relative z-10">
        {/* --- Header 3D Floating --- */}
        <header className="flex flex-col md:flex-row justify-between items-center bg-white/70 backdrop-blur-2xl p-4 md:p-5 rounded-3xl md:rounded-[2rem] shadow-[0_10px_40px_-10px_rgba(0,0,0,0.08)] border border-white/80">
          <div className="flex items-center gap-4 md:gap-5 mb-4 md:mb-0 group cursor-default">
            <div className="w-12 h-12 md:w-14 md:h-14 bg-gradient-to-tr from-blue-600 to-cyan-400 rounded-2xl flex items-center justify-center shadow-[0_10px_20px_rgba(37,99,235,0.3)] shadow-inner transform transition-transform duration-500 group-hover:rotate-12 group-hover:scale-110 border-t border-white/40">
              <Waves className="w-6 h-6 md:w-7 md:h-7 text-white" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight drop-shadow-sm">
                Posko Wilayah Kelurahan
              </h1>
              <p className="text-[10px] md:text-xs font-bold text-blue-500 uppercase tracking-widest">
                Smart Flood Monitoring Dashboard
              </p>
            </div>
          </div>

          <div
            className={`flex items-center gap-2 md:gap-3 px-4 py-2.5 md:px-5 md:py-3 rounded-xl md:rounded-2xl font-bold text-xs md:text-sm shadow-[inset_0_2px_10px_rgba(0,0,0,0.05)] border ${isConnected ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-rose-50 text-rose-600 border-rose-100"}`}
          >
            <Radio
              className={`w-4 h-4 md:w-5 md:h-5 ${isConnected ? "animate-pulse text-emerald-500" : "text-rose-500"}`}
            />
            <span className="drop-shadow-sm">
              {isConnected ? "Sistem Terhubung" : "Menghubungkan..."}
            </span>
          </div>
        </header>

        {/* --- Hero Banner 3D --- */}
        <section
          className={`relative flex flex-col md:flex-row justify-between items-center p-6 md:p-10 rounded-3xl md:rounded-[2.5rem] border border-white/40 transition-all duration-700 ${currentVisual.cardBg} ${currentVisual.shadow}`}
        >
          <div className="absolute inset-0 rounded-3xl md:rounded-[2.5rem] shadow-[inset_0_2px_20px_rgba(255,255,255,0.5)] pointer-events-none"></div>

          <div className="flex items-center gap-5 md:gap-6 relative z-10">
            <div className="p-4 md:p-5 bg-white/20 backdrop-blur-md rounded-2xl md:rounded-3xl shadow-[0_10px_25px_rgba(0,0,0,0.1)] border border-white/30 transform transition-transform duration-500 hover:scale-110 hover:-translate-y-2 cursor-pointer">
              {currentVisual.icon}
            </div>
            <div>
              <h2 className="text-[10px] md:text-xs font-black text-white/80 uppercase tracking-[0.2em] mb-1 drop-shadow-md">
                Status Wilayah Terkini
              </h2>
              <div className="text-4xl md:text-5xl font-black text-white drop-shadow-[0_4px_4px_rgba(0,0,0,0.2)] tracking-tight">
                {statusWilayah}
              </div>
            </div>
          </div>

          {statusWilayah === "BAHAYA" && (
            <div className="mt-6 md:mt-0 px-6 py-3 md:px-8 md:py-4 bg-white text-red-600 rounded-xl md:rounded-2xl font-black text-sm md:text-lg flex items-center gap-2 md:gap-3 shadow-[0_15px_30px_rgba(0,0,0,0.2)] border-b-4 border-slate-200 transform hover:scale-105 transition-transform cursor-pointer relative z-10">
              <BellRing className="w-5 h-5 md:w-7 md:h-7 animate-bounce" />
              STATUS BAHAYA - EVAKUASI!
            </div>
          )}
        </section>

        {/* --- Grid Cards 3D --- */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
          {/* Card Node 1: Hulu Sungai */}
          <div className="bg-white/80 backdrop-blur-xl p-6 md:p-8 rounded-3xl md:rounded-[2rem] shadow-[0_15px_35px_-5px_rgba(0,0,0,0.05)] border border-white hover:shadow-[0_20px_40px_-5px_rgba(0,0,0,0.1)] hover:-translate-y-1 md:hover:-translate-y-2 transition-all duration-300">
            <div className="flex justify-between items-center mb-6 md:mb-8">
              <div className="flex items-center gap-3">
                <div className="p-2.5 md:p-3 bg-gradient-to-br from-blue-400 to-blue-600 rounded-xl md:rounded-2xl shadow-[0_5px_15px_rgba(37,99,235,0.3)] text-white">
                  <Waves className="w-5 h-5 md:w-6 md:h-6" />
                </div>
                <h3 className="font-extrabold text-slate-800 text-base md:text-lg">
                  Hulu Sungai
                </h3>
              </div>
              <span className="text-[9px] md:text-[10px] font-black bg-slate-100 text-slate-400 px-2.5 py-1 md:px-3 md:py-1.5 rounded-lg md:rounded-xl shadow-inner border border-slate-200">
                NODE 1
              </span>
            </div>

            <div className="space-y-4 md:space-y-6">
              <div className="bg-slate-50 p-4 md:p-5 rounded-2xl shadow-[inset_0_2px_10px_rgba(0,0,0,0.02)] border border-slate-100">
                <p className="text-slate-400 text-[10px] md:text-xs font-bold uppercase tracking-widest mb-1">
                  Sensor Jarak (HC-SR04)
                </p>
                <div className="flex items-baseline gap-2">
                  <p className="text-4xl md:text-5xl font-black text-slate-800 drop-shadow-sm">
                    {nodeSungai.level}
                  </p>
                  <span className="text-sm md:text-base text-slate-500 font-bold">
                    cm
                  </span>
                </div>
              </div>
              <div>
                <p className="text-slate-400 text-[9px] md:text-[10px] font-bold uppercase tracking-widest mb-1 md:mb-2 ml-1">
                  Status Sensor Hulu
                </p>
                <div
                  className={`px-4 py-2 md:py-2.5 rounded-xl font-bold text-xs md:text-sm border shadow-sm inline-flex items-center justify-center w-full ${nodeSungai.status === "BAHAYA" ? "bg-red-50 text-red-600 border-red-200" : "bg-white text-slate-700 border-slate-200"}`}
                >
                  {nodeSungai.status}
                </div>
              </div>
            </div>
          </div>

          {/* Card Node 2: Pintu Air */}
          <div className="bg-white/80 backdrop-blur-xl p-6 md:p-8 rounded-3xl md:rounded-[2rem] shadow-[0_15px_35px_-5px_rgba(0,0,0,0.05)] border border-white hover:shadow-[0_20px_40px_-5px_rgba(0,0,0,0.1)] hover:-translate-y-1 md:hover:-translate-y-2 transition-all duration-300 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-6 md:mb-8">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 md:p-3 bg-gradient-to-br from-indigo-400 to-indigo-600 rounded-xl md:rounded-2xl shadow-[0_5px_15px_rgba(79,70,229,0.3)] text-white">
                    <Settings2 className="w-5 h-5 md:w-6 md:h-6" />
                  </div>
                  <h3 className="font-extrabold text-slate-800 text-base md:text-lg">
                    Pintu Air
                  </h3>
                </div>
                <span className="text-[9px] md:text-[10px] font-black bg-indigo-50 text-indigo-600 px-2.5 py-1 md:px-3 md:py-1.5 rounded-lg md:rounded-xl shadow-inner border border-indigo-100">
                  NODE 2
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 md:gap-4 mb-3 md:mb-4">
                <div className="bg-slate-50 p-3 md:p-4 rounded-xl md:rounded-2xl shadow-[inset_0_2px_10px_rgba(0,0,0,0.02)] border border-slate-100 text-center">
                  <p className="text-slate-400 text-[9px] md:text-[10px] font-bold uppercase tracking-widest mb-1">
                    Bukaan Pintu
                  </p>
                  <p className="text-2xl md:text-3xl font-black text-indigo-600 drop-shadow-sm">
                    {nodePintuAir.bukaan}%
                  </p>
                </div>
                <div className="bg-slate-50 p-3 md:p-4 rounded-xl md:rounded-2xl shadow-[inset_0_2px_10px_rgba(0,0,0,0.02)] border border-slate-100 text-center">
                  <p className="text-slate-400 text-[9px] md:text-[10px] font-bold uppercase tracking-widest mb-1">
                    Level Air
                  </p>
                  <p className="text-2xl md:text-3xl font-black text-slate-800 drop-shadow-sm">
                    {nodePintuAir.levelLokal}
                    <span className="text-xs md:text-sm font-medium text-slate-500 ml-1">
                      cm
                    </span>
                  </p>
                </div>
              </div>

              <div className="mb-2">
                <div
                  className={`px-4 py-1 md:py-2.5 rounded-xl font-bold text-xs md:text-sm border shadow-sm inline-flex items-center justify-center w-full ${nodePintuAir.status === "BAHAYA" ? "bg-red-50 text-red-600 border-red-200" : "bg-white text-slate-700 border-slate-200"}`}
                >
                  Status Lokal: {nodePintuAir.status}
                </div>
              </div>
            </div>

            <div className="bg-slate-100/50 p-3 md:p-4 rounded-xl md:rounded-2xl border border-slate-200 mt-4 md:mt-6 shadow-inner">
              <p className="text-[9px] md:text-[10px] font-black text-slate-400 mb-2 md:mb-3 uppercase text-center tracking-widest">
                Kontrol Aktuator
              </p>
              <div className="grid grid-cols-3 gap-2 md:gap-3">
                <button
                  onClick={() => kontrolPintu(0)}
                  className="bg-white border border-slate-200 text-slate-600 text-[10px] md:text-xs font-black py-2.5 md:py-3 rounded-lg md:rounded-xl shadow-[0_4px_0_rgb(226,232,240)] active:shadow-[0_0px_0_rgb(226,232,240)] active:translate-y-1 transition-all"
                >
                  0%
                </button>
                <button
                  onClick={() => kontrolPintu(50)}
                  className="bg-gradient-to-b from-blue-400 to-blue-500 text-white border border-blue-600 text-[10px] md:text-xs font-black py-2.5 md:py-3 rounded-lg md:rounded-xl shadow-[0_4px_0_rgb(37,99,235)] active:shadow-[0_0px_0_rgb(37,99,235)] active:translate-y-1 transition-all"
                >
                  50%
                </button>
                <button
                  onClick={() => kontrolPintu(100)}
                  className="bg-gradient-to-b from-indigo-500 to-indigo-600 text-white border border-indigo-700 text-[10px] md:text-xs font-black py-2.5 md:py-3 rounded-lg md:rounded-xl shadow-[0_4px_0_rgb(67,56,202)] active:shadow-[0_0px_0_rgb(67,56,202)] active:translate-y-1 transition-all"
                >
                  100%
                </button>
              </div>
            </div>
          </div>

          {/* Card Node 3: Posko Lokal */}
          <div className="bg-white/80 backdrop-blur-xl p-6 md:p-8 rounded-3xl md:rounded-[2rem] shadow-[0_15px_35px_-5px_rgba(0,0,0,0.05)] border border-white hover:shadow-[0_20px_40px_-5px_rgba(0,0,0,0.1)] hover:-translate-y-1 md:hover:-translate-y-2 transition-all duration-300 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-6 md:mb-8">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 md:p-3 bg-gradient-to-br from-cyan-400 to-cyan-500 rounded-xl md:rounded-2xl shadow-[0_5px_15px_rgba(6,182,212,0.3)] text-white">
                    <CloudRain className="w-5 h-5 md:w-6 md:h-6" />
                  </div>
                  <h3 className="font-extrabold text-slate-800 text-base md:text-lg">
                    Posko Lokal
                  </h3>
                </div>
                <span className="text-[9px] md:text-[10px] font-black bg-slate-100 text-slate-400 px-2.5 py-1 md:px-3 md:py-1.5 rounded-lg md:rounded-xl shadow-inner border border-slate-200">
                  NODE 3
                </span>
              </div>

              <div className="bg-slate-50 p-4 md:p-5 rounded-2xl shadow-[inset_0_2px_10px_rgba(0,0,0,0.02)] border border-slate-100 mb-5 md:mb-6 text-center">
                <p className="text-slate-400 text-[10px] md:text-xs font-bold uppercase tracking-widest mb-2 md:mb-3">
                  Deteksi Cuaca (Rain Sensor)
                </p>
                <span className="text-xl md:text-2xl font-black text-slate-700 drop-shadow-sm">
                  {hujanLokal}
                </span>
              </div>
            </div>

            <div
              className={`p-4 md:p-5 rounded-2xl shadow-inner border flex items-center justify-between transition-colors duration-500 ${statusWilayah === "BAHAYA" ? "bg-red-50 border-red-200" : "bg-slate-50 border-slate-200"}`}
            >
              <div>
                <p className="text-[9px] md:text-[10px] font-black uppercase tracking-widest mb-1 text-slate-400">
                  Alarm Virtual (MQTT)
                </p>
                <p
                  className={`text-sm md:text-base font-black ${statusWilayah === "BAHAYA" ? "text-red-600" : "text-slate-600"}`}
                >
                  {statusWilayah === "BAHAYA" ? "Sinyal 'ON'" : "Sinyal 'OFF'"}
                </p>
              </div>
              <div
                className={`p-2.5 md:p-3 rounded-xl shadow-sm ${statusWilayah === "BAHAYA" ? "bg-red-500 text-white animate-pulse" : "bg-white text-slate-300"}`}
              >
                {statusWilayah === "BAHAYA" ? (
                  <BellRing className="w-5 h-5 md:w-6 md:h-6" />
                ) : (
                  <BellOff className="w-5 h-5 md:w-6 md:h-6" />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* --- Tabel Log 3D --- */}
        <div className="bg-white/90 backdrop-blur-2xl rounded-3xl md:rounded-[2rem] shadow-[0_20px_50px_-10px_rgba(0,0,0,0.05)] border border-white overflow-hidden transform transition-all">
          <div className="p-5 md:p-8 border-b border-slate-100 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 md:gap-4 bg-gradient-to-r from-slate-50 to-white">
            <div>
              <h3 className="font-extrabold text-slate-800 text-lg md:text-xl tracking-tight">
                Riwayat Sistem Terpadu
              </h3>
            </div>
            <span className="text-[9px] md:text-[10px] font-black bg-white text-slate-400 px-3 py-1.5 md:px-4 md:py-2 rounded-lg md:rounded-xl tracking-widest shadow-[inset_0_2px_5px_rgba(0,0,0,0.05)] border border-slate-200 self-start sm:self-auto">
              AUTO-LOGGING
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 text-slate-400 text-[10px] md:text-xs uppercase tracking-widest border-b border-slate-100">
                  <th className="p-4 md:p-5 font-bold pl-5 md:pl-8">Waktu</th>
                  <th className="p-4 md:p-5 font-bold">Data Hulu</th>
                  <th className="p-4 md:p-5 font-bold">Data Pintu Air</th>
                  <th className="p-4 md:p-5 font-bold">Curah Hujan</th>
                  <th className="p-4 md:p-5 font-bold">Status Akhir</th>
                </tr>
              </thead>
              <tbody className="text-xs md:text-sm text-slate-600 font-medium">
                {logs.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="p-8 md:p-12 text-center text-slate-400"
                    >
                      <div className="flex flex-col items-center justify-center gap-3 md:gap-4">
                        <div className="w-8 h-8 md:w-10 md:h-10 border-4 border-slate-100 border-t-blue-500 rounded-full animate-spin shadow-sm"></div>
                        Menunggu rekaman log pertama...
                      </div>
                    </td>
                  </tr>
                )}
                {logs.map((log, idx) => (
                  <tr
                    key={idx}
                    className="border-b border-slate-50 hover:bg-slate-50/80 transition-colors group"
                  >
                    <td className="p-4 md:p-5 pl-5 md:pl-8 text-slate-400 group-hover:text-blue-500 transition-colors">
                      {log.waktu}
                    </td>
                    <td className="p-4 md:p-5 font-bold text-slate-700">
                      {log.sungai}
                    </td>
                    <td className="p-4 md:p-5 font-bold text-slate-700">
                      {log.pintu}
                    </td>
                    <td className="p-4 md:p-5 font-bold text-slate-700">
                      {log.hujan}
                    </td>
                    <td className="p-4 md:p-5">
                      <span className="px-2.5 py-1 md:px-3 md:py-1.5 text-[10px] md:text-[11px] font-black rounded-lg border shadow-sm bg-white text-slate-700 uppercase tracking-wider">
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
