import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, doc, setDoc, getDoc, updateDoc, 
  onSnapshot, query, serverTimestamp, addDoc 
} from 'firebase/firestore';
import { 
  getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken 
} from 'firebase/auth';
import { 
  User, Phone, Award, BarChart3, Users, Clock, AlertCircle, 
  CheckCircle2, ChevronRight, Briefcase, CreditCard, Calendar, 
  TrendingUp, ShieldAlert, Plus, Timer, History
} from 'lucide-react';

// --- CONFIGURACIÓN FIREBASE ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'fenix-prime-v1';

// --- CONSTANTES DE NEGOCIO ---
const ASESORES_INICIALES = [
  { nombre: "Karl", grupo: "POTENCIAL", nivel: "MASTER" },
  { nombre: "Marcelo", grupo: "POTENCIAL", nivel: "MASTER" },
  { nombre: "Victor", grupo: "POTENCIAL", nivel: "MASTER" },
  { nombre: "Andrea", grupo: "SEMI POTENCIAL", nivel: "SENIOR" },
  { nombre: "Christian", grupo: "SEMI POTENCIAL", nivel: "SENIOR" },
  { nombre: "Maria", grupo: "SEMI POTENCIAL", nivel: "SENIOR" },
  { nombre: "Gabriela", grupo: "INFORMATIVO", nivel: "JUNIOR" },
  { nombre: "Ana Gabriela", grupo: "INFORMATIVO", nivel: "JUNIOR" },
  { nombre: "Celio", grupo: "OTROS", nivel: "GENERAL" },
  { nombre: "Daniel", grupo: "OTROS", nivel: "GENERAL" },
  { nombre: "Vannessa", grupo: "OTROS", nivel: "GENERAL" }
];

// --- COMPONENTE PRINCIPAL ---
export default function TeamFenixApp() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('evaluacion');
  const [loading, setLoading] = useState(true);
  const [evaluando, setEvaluando] = useState(false);
  const [popup, setPopup] = useState(null);
  const [asesores, setAsesores] = useState([]);
  const [clientes, setClientes] = useState([]);

  // Formulario
  const [formData, setFormData] = useState({
    nombreCliente: '',
    telefonoCliente: '',
    propietarioCliente: '',
    registradorCliente: '',
    estadoCivil: 'Soltero',
    decidePareja: 'No',
    tipoCapital: 'Efectivo',
    tiempoCompra: 'Inmediato',
    modelo1: '',
    modelo2: '',
    modelo3: '',
    riesgo: 'Normal'
  });

  // --- EFECTOS INICIALES ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) { console.error("Auth error", e); }
    };
    initAuth();
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) bootstrapAsesores();
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!user) return;

    // Listener de Asesores
    const qAsesores = query(collection(db, 'artifacts', appId, 'public', 'data', 'asesores'));
    const unsubAsesores = onSnapshot(qAsesores, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAsesores(list);
      setLoading(false);
    }, (err) => console.error(err));

    // Listener de Clientes (últimos 20)
    const qClientes = query(collection(db, 'artifacts', appId, 'public', 'data', 'clientes'));
    const unsubClientes = onSnapshot(qClientes, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setClientes(list.sort((a, b) => b.fechaRegistro?.seconds - a.fechaRegistro?.seconds));
    });

    return () => { unsubAsesores(); unsubClientes(); };
  }, [user]);

  // Inicializar asesores si la colección está vacía
  const bootstrapAsesores = async () => {
    const coll = collection(db, 'artifacts', appId, 'public', 'data', 'asesores');
    const snap = await getDoc(doc(coll, "Karl")); // Chequeo simple
    if (!snap.exists()) {
      for (const a of ASESORES_INICIALES) {
        await setDoc(doc(coll, a.nombre), {
          ...a,
          estado: 'Libre',
          ultimaAsignacion: null,
          clienteActual: null,
          proximaDisponibilidad: null
        });
      }
    }
  };

  // --- LÓGICA DE NEGOCIO ---

  const calcularScore = () => {
    let score = 0;
    // Decisión - AJUSTADOS PARA MAYOR DIFERENCIA
    if (formData.estadoCivil === 'Soltero') score += 35;
    else if (formData.decidePareja === 'Sí') score += 35;
    else score += 8;

    // Capital - AJUSTADOS
    score += (formData.tipoCapital === 'Cuenta bancaria' ? 25 : 8);
    // Tiempo - AJUSTADOS
    score += (formData.tiempoCompra === 'Puede esperar' ? 25 : 8);
    // Riesgo - AJUSTADOS
    score += (formData.riesgo === 'Normal' ? 25 : 35);

    return score;
  };

  const obtenerClasificacion = (score) => {
    if (score >= 85) return 'POTENCIAL';
    if (score >= 50) return 'SEMI POTENCIAL';
    return 'INFORMATIVO';
  };

  const ejecutarEvaluacion = async () => {
    if (!formData.nombreCliente || !formData.propietarioCliente) {
      alert("Por favor completa los datos básicos (Nombre y Propietario)");
      return;
    }

    setEvaluando(true);
    const score = calcularScore();
    const clasificacion = obtenerClasificacion(score);
    
    // Buscar asesor disponible bajo reglas
    const ahora = Date.now();
    let asesorAsignado = "POR ASIGNAR";

    // ✅ NUEVA LÓGICA: SI ES INFORMATIVO, EL REGISTRADOR LO ATIENDE
    if (clasificacion === 'INFORMATIVO') {
      asesorAsignado = formData.registradorCliente;
      
      // Actualizar Asesor Registrador en DB
      const asesorRegistrador = asesores.find(a => a.nombre === formData.registradorCliente);
      if (asesorRegistrador) {
        const proximaDisp = ahora + (40 * 60 * 1000); // 40 minutos
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'asesores', asesorRegistrador.id), {
          estado: 'Ocupado',
          clienteActual: formData.nombreCliente,
          ultimaAsignacion: ahora,
          proximaDisponibilidad: proximaDisp
        });
      }
    } else {
      // LÓGICA ORIGINAL PARA POTENCIAL Y SEMI POTENCIAL
      // Filtrar candidatos del grupo correspondiente
      const candidatos = asesores.filter(a => {
        const esMismoGrupo = a.grupo === clasificacion;
        const noEsRegistrador = a.nombre !== formData.registradorCliente;
        const estaLibre = a.estado === 'Libre';
        const cumplioTiempo = !a.proximaDisponibilidad || ahora >= a.proximaDisponibilidad;
        return esMismoGrupo && noEsRegistrador && estaLibre && cumplioTiempo;
      });

      // Rotación: Elegir al que más tiempo lleva sin atender
      if (candidatos.length > 0) {
        candidatos.sort((a, b) => (a.ultimaAsignacion || 0) - (b.ultimaAsignacion || 0));
        const elegido = candidatos[0];
        asesorAsignado = elegido.nombre;

        // Actualizar Asesor en DB
        const proximaDisp = ahora + (40 * 60 * 1000); // 40 minutos
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'asesores', elegido.id), {
          estado: 'Ocupado',
          clienteActual: formData.nombreCliente,
          ultimaAsignacion: ahora,
          proximaDisponibilidad: proximaDisp
        });
      }
    }

    // Guardar Cliente
    const newClient = {
      ...formData,
      score,
      clasificacion,
      asesorAsignado,
      fechaRegistro: serverTimestamp()
    };
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'clientes'), newClient);

    // Mostrar Popup
    setPopup({ score, clasificacion, asesor: asesorAsignado });
    setTimeout(() => {
      setPopup(null);
      setEvaluando(false);
      setFormData({
        nombreCliente: '', telefonoCliente: '', propietarioCliente: '', registradorCliente: '',
        estadoCivil: 'Soltero', decidePareja: 'No', tipoCapital: 'Efectivo',
        tiempoCompra: 'Inmediato', modelo1: '', modelo2: '', modelo3: '', riesgo: 'Normal'
      });
    }, 5000);
  };

  const extenderAtencion = async (asesorId) => {
    const asesor = asesores.find(a => a.id === asesorId);
    if (!asesor) return;
    const nuevaDisp = (asesor.proximaDisponibilidad || Date.now()) + (30 * 60 * 1000); // +30 min
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'asesores', asesorId), {
      proximaDisponibilidad: nuevaDisp
    });
  };

  const liberarAsesor = async (asesorId) => {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'asesores', asesorId), {
        estado: 'Libre',
        clienteActual: null
      });
  };

  // --- RENDERIZADO ---

  return (
    <div className="min-h-screen bg-[#0D0D0D] text-white font-sans selection:bg-[#C9A646]/30">
      
      {/* Header Premium */}
      <header className="bg-black border-b border-[#C9A646]/20 p-6 sticky top-0 z-40 backdrop-blur-md bg-black/80">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-black tracking-tighter text-[#C9A646] italic">TEAM FENIX PRIME</h1>
            <p className="text-[10px] uppercase tracking-[0.2em] text-gray-400 font-bold">Sistema de Clasificación Comercial</p>
          </div>
          <div className="hidden md:flex gap-4 items-center text-xs text-gray-400 uppercase font-bold tracking-widest">
            <span className="flex items-center gap-1"><Clock size={14} className="text-[#C9A646]"/> {new Date().toLocaleDateString()}</span>
            <div className="h-4 w-px bg-gray-800"></div>
            <span className="text-[#C9A646] uppercase">Admin Mode</span>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <nav className="flex justify-center border-b border-white/5 bg-[#141414]">
        <button 
          onClick={() => setActiveTab('evaluacion')}
          className={`px-8 py-4 text-sm font-bold uppercase tracking-widest transition-all ${activeTab === 'evaluacion' ? 'text-[#C9A646] border-b-2 border-[#C9A646]' : 'text-gray-500 hover:text-white'}`}
        >
          Evaluación
        </button>
        <button 
          onClick={() => setActiveTab('panel')}
          className={`px-8 py-4 text-sm font-bold uppercase tracking-widest transition-all ${activeTab === 'panel' ? 'text-[#C9A646] border-b-2 border-[#C9A646]' : 'text-gray-500 hover:text-white'}`}
        >
          Panel Operativo
        </button>
      </nav>

      <main className="max-w-6xl mx-auto p-4 md:p-8">
        {activeTab === 'evaluacion' ? (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Formulario Izquierda */}
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-[#1C1C1C] border border-white/5 rounded-2xl p-8 shadow-2xl">
                  
                  {/* Sección 1: Identificación */}
                  <div className="mb-10">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2 bg-[#C9A646]/10 rounded-lg text-[#C9A646]">
                        <User size={20} />
                      </div>
                      <h2 className="text-xl font-bold tracking-tight text-[#C9A646]">DATOS DEL CLIENTE</h2>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Nombre Cliente</label>
                        <input 
                          value={formData.nombreCliente}
                          onChange={(e) => setFormData({...formData, nombreCliente: e.target.value})}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 focus:border-[#C9A646] transition-colors outline-none" 
                          placeholder="Ej: Juan Pérez"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Teléfono</label>
                        <input 
                          value={formData.telefonoCliente}
                          onChange={(e) => setFormData({...formData, telefonoCliente: e.target.value})}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 focus:border-[#C9A646] outline-none" 
                          placeholder="+51..."
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Propietario del Cliente</label>
                        <select 
                          value={formData.propietarioCliente}
                          onChange={(e) => setFormData({...formData, propietarioCliente: e.target.value})}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 focus:border-[#C9A646] outline-none appearance-none"
                        >
                          <option value="">Seleccionar Asesor...</option>
                          {ASESORES_INICIALES.map(a => <option key={a.nombre} value={a.nombre}>{a.nombre}</option>)}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Registrador de Datos</label>
                        <select 
                          value={formData.registradorCliente}
                          onChange={(e) => setFormData({...formData, registradorCliente: e.target.value})}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 focus:border-[#C9A646] outline-none appearance-none"
                        >
                          <option value="">Seleccionar...</option>
                          {ASESORES_INICIALES.map(a => <option key={a.nombre} value={a.nombre}>{a.nombre}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="h-px bg-gradient-to-r from-transparent via-[#C9A646]/30 to-transparent my-10"></div>

                  {/* Sección 2: Evaluación Comercial */}
                  <div className="space-y-10">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2 bg-[#8B1E1E]/10 rounded-lg text-[#8B1E1E]">
                        <BarChart3 size={20} />
                      </div>
                      <h2 className="text-xl font-bold tracking-tight text-[#C9A646]">EVALUACIÓN COMERCIAL</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                      
                      {/* Toma de Decisión */}
                      <div className="space-y-6">
                        <div className="flex items-center gap-2">
                           <ShieldAlert size={16} className="text-[#C9A646]" />
                           <h3 className="text-sm font-black uppercase tracking-widest text-white">Toma de Decisión</h3>
                        </div>
                        <div className="space-y-4">
                          <label className="text-xs text-gray-400">Estado Civil</label>
                          <div className="grid grid-cols-3 gap-2">
                            {['Soltero', 'Casado', 'Conviviente'].map(op => (
                              <button 
                                key={op}
                                onClick={() => setFormData({...formData, estadoCivil: op})}
                                className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${formData.estadoCivil === op ? 'bg-[#C9A646] text-black border-[#C9A646]' : 'bg-white/5 border-white/10 text-gray-500'}`}
                              >
                                {op}
                              </button>
                            ))}
                          </div>
                        </div>
                        {formData.estadoCivil !== 'Soltero' && (
                          <div className="p-4 bg-white/5 border border-white/5 rounded-xl animate-in fade-in slide-in-from-top-2">
                            <label className="text-xs text-gray-400 block mb-3">¿Está presente el/la cónyuge?</label>
                            <div className="flex gap-2">
                              {['Sí', 'No'].map(v => (
                                <button 
                                  key={v}
                                  onClick={() => setFormData({...formData, decidePareja: v})}
                                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${formData.decidePareja === v ? 'bg-white text-black' : 'bg-black/40 text-gray-500'}`}
                                >
                                  {v}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Capital y Tiempo */}
                      <div className="space-y-8">
                        <div>
                          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3 block">Capital de Financiamiento</label>
                          <div className="grid grid-cols-2 gap-3">
                            {['Cuenta bancaria', 'Efectivo'].map(c => (
                              <button 
                                key={c}
                                onClick={() => setFormData({...formData, tipoCapital: c})}
                                className={`p-4 border rounded-xl text-left transition-all ${formData.tipoCapital === c ? 'border-[#C9A646] bg-[#C9A646]/10' : 'border-white/5 bg-black/20 text-gray-500'}`}
                              >
                                <CreditCard size={16} className={`mb-2 ${formData.tipoCapital === c ? 'text-[#C9A646]' : 'text-gray-600'}`} />
                                <span className="text-xs font-bold block">{c}</span>
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3 block">Tiempo de Compra</label>
                          <div className="flex gap-2">
                             {['Inmediato', 'Puede esperar'].map(t => (
                               <button 
                                key={t}
                                onClick={() => setFormData({...formData, tiempoCompra: t})}
                                className={`flex-1 py-3 text-xs font-bold rounded-xl border transition-all ${formData.tiempoCompra === t ? 'bg-[#C9A646] text-black border-[#C9A646]' : 'bg-white/5 border-white/10 text-gray-500'}`}
                               >
                                 {t}
                               </button>
                             ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Modelos */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-6 bg-black/40 rounded-2xl border border-white/5">
                        <div className="md:col-span-3 text-[10px] font-black tracking-widest text-gray-500 mb-2 uppercase">Modelos de Interés</div>
                        <input value={formData.modelo1} onChange={(e)=>setFormData({...formData, modelo1:e.target.value})} className="bg-[#1C1C1C] border border-white/10 rounded-lg p-3 text-xs outline-none" placeholder="Modelo 1" />
                        <input value={formData.modelo2} onChange={(e)=>setFormData({...formData, modelo2:e.target.value})} className="bg-[#1C1C1C] border border-white/10 rounded-lg p-3 text-xs outline-none" placeholder="Modelo 2" />
                        <input value={formData.modelo3} onChange={(e)=>setFormData({...formData, modelo3:e.target.value})} className="bg-[#1C1C1C] border border-white/10 rounded-lg p-3 text-xs outline-none" placeholder="Modelo 3" />
                    </div>

                    {/* Riesgo */}
                    <div className="space-y-4">
                       <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block">Centrales de Riesgo</label>
                       <div className="flex gap-4">
                         <button 
                          onClick={() => setFormData({...formData, riesgo: 'Normal'})}
                          className={`flex-1 flex items-center justify-center gap-2 p-4 rounded-xl border transition-all ${formData.riesgo === 'Normal' ? 'border-[#C9A646] bg-[#C9A646]/10 text-[#C9A646]' : 'border-white/5 text-gray-500'}`}
                         >
                           <CheckCircle2 size={18} /> Normal
                         </button>
                         <button 
                          onClick={() => setFormData({...formData, riesgo: 'Pérdida'})}
                          className={`flex-1 flex items-center justify-center gap-2 p-4 rounded-xl border transition-all ${formData.riesgo === 'Pérdida' ? 'border-[#8B1E1E] bg-[#8B1E1E]/10 text-[#8B1E1E]' : 'border-white/5 text-gray-500'}`}
                         >
                           <AlertCircle size={18} /> Pérdida
                         </button>
                       </div>
                    </div>
                  </div>

                  <button 
                    disabled={evaluando}
                    onClick={ejecutarEvaluacion}
                    className="w-full mt-12 bg-gradient-to-r from-[#C9A646] to-[#A88B3A] text-black font-black py-5 rounded-2xl shadow-xl shadow-[#C9A646]/10 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-3 uppercase tracking-tighter text-lg"
                  >
                    {evaluando ? <Timer className="animate-spin" /> : <Award />}
                    EVALUAR CLIENTE
                  </button>

                </div>
              </div>

              {/* Historial Derecha */}
              <div className="space-y-6">
                <div className="bg-[#141414] border border-white/5 rounded-2xl p-6">
                  <h3 className="text-xs font-black text-gray-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                    <History size={14} className="text-[#C9A646]" /> 
                    Últimos Registros
                  </h3>
                  <div className="space-y-4 max-h-[800px] overflow-y-auto pr-2 custom-scrollbar">
                    {clientes.slice(0, 10).map(c => (
                      <div key={c.id} className="p-4 bg-black/40 border-l-2 border-[#C9A646] rounded-r-xl space-y-2 animate-in slide-in-from-right-4">
                        <div className="flex justify-between items-start">
                          <p className="font-bold text-sm">{c.nombreCliente}</p>
                          <span className={`text-[9px] px-2 py-0.5 rounded font-black ${c.clasificacion === 'POTENCIAL' ? 'bg-[#8B1E1E] text-white' : 'bg-[#C9A646] text-black'}`}>
                            {c.clasificacion}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-gray-500">
                          <User size={10} /> 
                          <span>Asignado a: <b className="text-white">{c.asesorAsignado}</b></span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

            </div>
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              
              {/* Disponibles */}
              <div className="space-y-6">
                 <div className="flex items-center justify-between mb-2">
                    <h2 className="text-xl font-black text-[#C9A646] flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                      ASESORES LIBRES
                    </h2>
                    <span className="text-[10px] bg-white/5 px-3 py-1 rounded-full text-gray-400">STATUS: READY</span>
                 </div>
                 <div className="grid gap-4">
                    {asesores.filter(a => a.estado === 'Libre').sort((a,b) => (a.ultimaAsignacion || 0) - (b.ultimaAsignacion || 0)).map(a => (
                      <div key={a.id} className="bg-[#1C1C1C] border border-white/5 p-5 rounded-2xl flex items-center justify-between group hover:border-[#C9A646]/40 transition-all">
                        <div className="flex items-center gap-4">
                           <div className="w-12 h-12 bg-black rounded-full border border-white/10 flex items-center justify-center text-[#C9A646] font-black text-xl">
                              {a.nombre[0]}
                           </div>
                           <div>
                              <p className="font-black text-lg">{a.nombre}</p>
                              <p className="text-[10px] text-gray-500 uppercase tracking-widest">{a.grupo} • {a.nivel}</p>
                              {a.ultimaAsignacion && (
                                <p className="text-[10px] text-gray-400 mt-1 italic">Última atención: {new Date(a.ultimaAsignacion).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                              )}
                           </div>
                        </div>
                        <div className="text-right">
                           <div className="text-[10px] text-green-500 font-bold uppercase mb-1">Disponible</div>
                           <div className="text-[10px] text-gray-600 font-mono">
                             {a.proximaDisponibilidad && Date.now() < a.proximaDisponibilidad ? 
                                `Refresca en ${Math.ceil((a.proximaDisponibilidad - Date.now()) / 60000)}min` : 'Listo'}
                           </div>
                        </div>
                      </div>
                    ))}
                 </div>
              </div>

              {/* Ocupados */}
              <div className="space-y-6">
                 <h2 className="text-xl font-black text-[#8B1E1E] flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full bg-[#8B1E1E]"></div>
                    ASESORES ATENDIENDO
                 </h2>
                 <div className="grid gap-4">
                    {asesores.filter(a => a.estado === 'Ocupado').map(a => {
                      const minsRestantes = a.proximaDisponibilidad ? Math.ceil((a.proximaDisponibilidad - Date.now()) / 60000) : 0;
                      return (
                        <div key={a.id} className="bg-[#1C1C1C] border-l-4 border-[#8B1E1E] p-5 rounded-r-2xl space-y-4">
                          <div className="flex justify-between items-start">
                            <div className="flex items-center gap-3">
                               <div className="w-10 h-10 bg-[#8B1E1E]/20 rounded-lg flex items-center justify-center text-[#8B1E1E] font-black">
                                 {a.nombre[0]}
                               </div>
                               <div>
                                 <p className="font-bold">{a.nombre}</p>
                                 <p className="text-[10px] text-gray-500">Atendiendo a: <span className="text-white font-bold">{a.clienteActual}</span></p>
                               </div>
                            </div>
                            <div className="text-right">
                               <div className="flex items-center gap-1 text-[10px] text-[#8B1E1E] font-black uppercase">
                                 <Timer size={10}/> {minsRestantes > 0 ? `${minsRestantes} MIN` : 'TERMINANDO'}
                               </div>
                            </div>
                          </div>
                          
                          <div className="flex gap-2">
                            <button 
                              onClick={() => extenderAtencion(a.id)}
                              className="flex-1 bg-white/5 hover:bg-[#8B1E1E]/20 hover:text-[#8B1E1E] border border-white/5 py-2 rounded-lg text-[10px] font-black uppercase transition-all"
                            >
                              Extender Atención
                            </button>
                            <button 
                              onClick={() => liberarAsesor(a.id)}
                              className="px-4 bg-black/40 hover:bg-white/10 py-2 rounded-lg text-[10px] font-black uppercase transition-all"
                            >
                              Finalizar
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {asesores.filter(a => a.estado === 'Ocupado').length === 0 && (
                      <div className="p-10 border-2 border-dashed border-white/5 rounded-2xl text-center text-gray-600 italic text-sm">
                        No hay asesores en gestión actualmente.
                      </div>
                    )}
                 </div>
              </div>

            </div>
          </div>
        )}
      </main>

      {/* PopUp de Resultado */}
      {popup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-in fade-in duration-300">
           <div className="bg-[#141414] border border-[#C9A646]/40 w-full max-w-sm rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(201,166,70,0.15)] animate-in zoom-in duration-500">
              <div className="bg-[#C9A646] p-8 text-black text-center">
                 <CheckCircle2 size={48} className="mx-auto mb-4" />
                 <h2 className="text-2xl font-black italic tracking-tighter">EVALUACIÓN COMPLETADA</h2>
              </div>
              <div className="p-8 space-y-6 text-center">
                 <div>
                    <p className="text-[10px] text-gray-500 uppercase font-black tracking-[0.2em] mb-1">Puntaje Total</p>
                    <p className="text-5xl font-black text-white">{popup.score}</p>
                 </div>
                 <div className="inline-block px-6 py-2 rounded-full bg-[#8B1E1E] text-white text-sm font-black italic tracking-widest">
                    {popup.clasificacion}
                 </div>
                 <div className="pt-4 border-t border-white/5">
                    <p className="text-[10px] text-gray-500 uppercase font-black tracking-[0.2em] mb-2">Asesor Asignado</p>
                    <p className="text-2xl font-black text-[#C9A646]">{popup.asesor}</p>
                 </div>
                 <p className="text-[9px] text-gray-600 font-bold uppercase pt-4 animate-pulse">Guardando en sistema...</p>
              </div>
           </div>
        </div>
      )}

      {/* Footer Info */}
      <footer className="p-10 text-center border-t border-white/5">
         <p className="text-[10px] text-gray-700 font-bold tracking-[0.3em] uppercase">TEAM FENIX PRIME © 2024 - EXCELLENCE IN MOTION</p>
      </footer>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1C1C1C; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #C9A646; }
      `}} />
    </div>
  );
}