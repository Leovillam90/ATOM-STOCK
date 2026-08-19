'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, doc, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import '@/app/globals.css';

export default function TrasladosPage() {
  const [userAuth, setUserAuth] = useState<any>(null);
  
  // Datos de Firebase
  const [traslados, setTraslados] = useState<any[]>([]);
  const [sucursales, setSucursales] = useState<any[]>([]);
  const [productos, setProductos] = useState<any[]>([]);
  
  // Filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'TODOS' | 'EN_TRANSITO' | 'COMPLETADO'>('TODOS');

  // Modal Nuevo Traslado
  const [showModal, setShowModal] = useState(false);
  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  
  // Carrito interno del traslado
  const [itemsTraslado, setItemsTraslado] = useState<any[]>([]);
  const [prodSeleccionado, setProdSeleccionado] = useState('');
  const [cantSeleccionada, setCantSeleccionada] = useState<number | ''>('');

  // Estados para el Buscador de Productos Customizado
  const [isProdDropdownOpen, setIsProdDropdownOpen] = useState(false);
  const [searchProd, setSearchProd] = useState('');

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const savedUser = localStorage.getItem('atom_user_session');
    if (savedUser) setUserAuth(JSON.parse(savedUser));
  }, []);

  // Escuchar colecciones
  useEffect(() => {
    if (!userAuth || !userAuth.id_cuenta) return;

    const qTras = query(collection(db, 'traslados'), where('id_cuenta', '==', userAuth.id_cuenta));
    const unsubTras = onSnapshot(qTras, (snap) => setTraslados(snap.docs.map(d => ({ ...d.data(), id_doc: d.id }))));

    const qSuc = query(collection(db, 'sucursales'), where('id_cuenta', '==', userAuth.id_cuenta));
    const unsubSuc = onSnapshot(qSuc, (snap) => setSucursales(snap.docs.map(d => d.data())));

    const qProd = query(collection(db, 'productos'), where('id_cuenta', '==', userAuth.id_cuenta));
    const unsubProd = onSnapshot(qProd, (snap) => setProductos(snap.docs.map(d => ({ ...d.data(), sku: d.id }))));

    return () => { unsubTras(); unsubSuc(); unsubProd(); };
  }, [userAuth]);

  // 🛡️ Filtrar sedes de origen según el rol
  const sedesOrigenPermitidas = useMemo(() => {
    if (!userAuth) return [];
    if (userAuth.rol === 'ADMIN' || userAuth.rol === 'GERENTE_BODEGA') {
      return sucursales.filter(s => s.estado !== 'INACTIVA');
    }
    
    // Si es VENDEDOR, solo ve sus sedes asignadas
    let asignadas = Array.isArray(userAuth.sedes_asignadas) 
      ? userAuth.sedes_asignadas 
      : (userAuth.id_sucursal ? [userAuth.id_sucursal] : []);
      
    return sucursales.filter(s => s.estado !== 'INACTIVA' && asignadas.includes(s.id_sucursal));
  }, [sucursales, userAuth]);

  // Lógica del buscador de productos custom
  const productosBusqueda = useMemo(() => {
    const term = searchProd.toLowerCase().trim();
    return productos.filter(p => {
      // Solo mostrar productos que tengan stock > 0 en la sede origen (si hay origen seleccionado)
      const disp = origen ? Number(p.stock?.[origen] || 0) : 0;
      if (origen && disp <= 0) return false;

      return String(p.nombre || '').toLowerCase().includes(term) || 
             String(p.sku || '').toLowerCase().includes(term);
    });
  }, [productos, searchProd, origen]);


  // ==========================================
  // LÓGICA DEL CARRITO DE TRASLADO
  // ==========================================
  const handleAddItem = () => {
    if (!origen) return alert('Primero selecciona la sede de Origen.');
    if (!prodSeleccionado) return alert('Selecciona un producto.');
    if (!cantSeleccionada || Number(cantSeleccionada) <= 0) return alert('Ingresa una cantidad válida.');

    const productoData = productos.find(p => p.sku === prodSeleccionado);
    if (!productoData) return;

    const stockDisponible = Number(productoData.stock?.[origen] || 0);
    if (Number(cantSeleccionada) > stockDisponible) {
      return alert(`Solo tienes ${stockDisponible} unidades de este producto en la sede de origen.`);
    }

    const existe = itemsTraslado.find(i => i.sku === prodSeleccionado);
    if (existe) {
      const nuevaCant = existe.cantidad + Number(cantSeleccionada);
      if (nuevaCant > stockDisponible) return alert('Superas el stock disponible.');
      setItemsTraslado(itemsTraslado.map(i => i.sku === prodSeleccionado ? { ...i, cantidad: nuevaCant } : i));
    } else {
      setItemsTraslado([...itemsTraslado, { 
        sku: productoData.sku, 
        nombre: productoData.nombre, 
        cantidad: Number(cantSeleccionada) 
      }]);
    }

    setProdSeleccionado('');
    setCantSeleccionada('');
  };

  const handleRemoveItem = (sku: string) => {
    setItemsTraslado(itemsTraslado.filter(i => i.sku !== sku));
  };

  // ==========================================
  // PASO 1: ENVIAR TRASLADO (RESTA STOCK)
  // ==========================================
  const handleGenerarTraslado = async () => {
    if (!origen || !destino) return alert('Selecciona origen y destino.');
    if (origen === destino) return alert('El origen y destino no pueden ser la misma sede.');
    if (itemsTraslado.length === 0) return alert('Agrega al menos un producto al traslado.');

    setLoading(true);
    try {
      const batch = writeBatch(db);
      const idTraslado = `TRAS_${Date.now().toString().slice(-6)}`;
      const fechaISO = new Date().toISOString();

      const nomOrigen = sucursales.find(s => s.id_sucursal === origen)?.nombre || origen;
      const nomDestino = sucursales.find(s => s.id_sucursal === destino)?.nombre || destino;

      // 1. Crear documento de Traslado
      const trasladoRef = doc(db, 'traslados', idTraslado);
      batch.set(trasladoRef, {
        id_cuenta: userAuth.id_cuenta,
        id_traslado: idTraslado,
        origen_id: origen,
        origen_nombre: nomOrigen,
        destino_id: destino,
        destino_nombre: nomDestino,
        items: itemsTraslado,
        estado: 'EN_TRANSITO',
        fecha_envio: fechaISO,
        usuario_envia: userAuth.nombre
      });

      // 2. Restar stock de la bodega de ORIGEN
      itemsTraslado.forEach(item => {
        const prodRef = doc(db, 'productos', item.sku);
        const prodData = productos.find(p => p.sku === item.sku);
        const stockActual = prodData?.stock || {};
        
        const nuevoStock = { 
          ...stockActual, 
          [origen]: Math.max(0, (Number(stockActual[origen]) || 0) - item.cantidad) 
        };

        batch.set(prodRef, { 
          stock: nuevoStock,
          fecha_actualizacion: fechaISO
        }, { merge: true });
      });

      await batch.commit();
      
      alert('¡Traslado generado! La mercancía ahora está EN TRÁNSITO.');
      setShowModal(false);
      setItemsTraslado([]);
      setOrigen('');
      setDestino('');
    } catch (error: any) {
      alert('Error: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // PASO 2: RECIBIR TRASLADO (SUMA STOCK)
  // ==========================================
  const handleRecibirTraslado = async (traslado: any) => {
    if (!confirm('¿Confirmas que recibiste la mercancía físicamente en la sede de destino?')) return;

    try {
      const batch = writeBatch(db);
      const fechaISO = new Date().toISOString();

      // 1. Cambiar estado del traslado
      const trasladoRef = doc(db, 'traslados', traslado.id_traslado);
      batch.set(trasladoRef, {
        estado: 'COMPLETADO',
        fecha_recepcion: fechaISO,
        usuario_recibe: userAuth.nombre
      }, { merge: true });

      // 2. Sumar stock a la bodega de DESTINO e inyectar auditoría
      traslado.items.forEach((item: any) => {
        const prodRef = doc(db, 'productos', item.sku);
        const prodData = productos.find(p => p.sku === item.sku);
        const stockActual = prodData?.stock || {};
        
        const nuevoStock = { 
          ...stockActual, 
          [traslado.destino_id]: (Number(stockActual[traslado.destino_id]) || 0) + item.cantidad 
        };

        const nuevaAuditoria = {
          fecha: fechaISO,
          usuario_nombre: userAuth?.nombre || 'Sistema',
          motivo: `Recepción de traslado desde ${traslado.origen_nombre} (Doc: ${traslado.id_traslado})`
        };

        const historialActualizado = [nuevaAuditoria, ...(Array.isArray(prodData?.historial_cambios) ? prodData.historial_cambios : [])];

        batch.set(prodRef, { 
          stock: nuevoStock,
          historial_cambios: historialActualizado,
          fecha_actualizacion: fechaISO
        }, { merge: true });
      });

      await batch.commit();
      alert('¡Mercancía recibida e inventario actualizado!');

    } catch (error: any) {
      alert('Error al recibir: ' + error.message);
    }
  };

  // ==========================================
  // RENDIMIENTO (Memoización)
  // ==========================================
  const { filtrados, totalTransito, totalCompletados } = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const result = traslados.filter(t => {
      const match = t.id_traslado.toLowerCase().includes(q) || 
                    t.origen_nombre.toLowerCase().includes(q) || 
                    t.destino_nombre.toLowerCase().includes(q);
      if (!match) return false;
      if (filtroEstado === 'TODOS') return true;
      return t.estado === filtroEstado;
    }).sort((a, b) => new Date(b.fecha_envio).getTime() - new Date(a.fecha_envio).getTime());

    return {
      filtrados: result,
      totalTransito: traslados.filter(t => t.estado === 'EN_TRANSITO').length,
      totalCompletados: traslados.filter(t => t.estado === 'COMPLETADO').length
    };
  }, [traslados, searchQuery, filtroEstado]);

  return (
    <div className="min-h-screen bg-[#1D2935] text-slate-100 p-6 md:p-10 font-sans relative pb-20">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 border-b border-slate-700/60 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-[#0DE8C0] animate-pulse"></span>
            <span className="text-[11px] font-satoshi-black text-[#0DE8C0] uppercase tracking-wider">
              Logística y Movimientos Internos
            </span>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight font-satoshi-black">
            Traslados de Mercancía
          </h1>
          <p className="text-xs text-[#A0AEC0] mt-1 font-satoshi-regular">
            Envía inventario entre bodegas. El stock se restará al enviar y se sumará al confirmar la recepción.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setOrigen('');
            setDestino('');
            setItemsTraslado([]);
            setProdSeleccionado('');
            setIsProdDropdownOpen(false);
            setShowModal(true);
          }}
          className="bg-[#0DE8C0] hover:bg-[#0bcfa8] text-[#1D2935] font-satoshi-black px-6 py-3.5 rounded-xl text-xs uppercase tracking-wider transition-all shadow-lg flex items-center gap-2"
        >
          <svg className="w-4 h-4 text-[#1D2935]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
          </svg>
          <span>Nuevo Traslado</span>
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-[#253443] border border-amber-500/50 rounded-2xl p-5 shadow-xl">
          <span className="text-[11px] font-satoshi-black text-amber-400 uppercase tracking-wider">EN TRÁNSITO (ESPERANDO RECEPCIÓN)</span>
          <div className="text-4xl font-black text-amber-300 font-satoshi-black mt-2">{totalTransito}</div>
        </div>
        <div className="bg-[#253443] border border-emerald-500/50 rounded-2xl p-5 shadow-xl">
          <span className="text-[11px] font-satoshi-black text-emerald-400 uppercase tracking-wider">TRASLADOS COMPLETADOS</span>
          <div className="text-4xl font-black text-emerald-300 font-satoshi-black mt-2">{totalCompletados}</div>
        </div>
      </div>

      {/* FILTROS */}
      <div className="bg-[#253443] border border-slate-700/50 rounded-2xl p-4 mb-8 flex flex-wrap gap-4 items-center justify-between">
        <input 
          type="text" 
          className="bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 w-full md:w-80"
          placeholder="Buscar ID, Origen o Destino..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        <div className="flex gap-2">
          {['TODOS', 'EN_TRANSITO', 'COMPLETADO'].map(est => (
            <button
              key={est}
              onClick={() => setFiltroEstado(est as any)}
              className={`px-4 py-2 rounded-xl text-xs font-satoshi-black transition ${
                filtroEstado === est ? 'bg-[#0DE8C0] text-[#1D2935]' : 'bg-[#1D2935] text-slate-400 border border-slate-700'
              }`}
            >
              {est.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* LISTA DE TRASLADOS */}
      <div className="space-y-4">
        {filtrados.map((t, idx) => (
          <div key={idx} className="bg-[#253443] border border-slate-700/50 rounded-2xl p-5 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="font-mono text-xs text-[#0DE8C0] bg-[#1D2935] px-2 py-1 rounded border border-slate-700">
                  {t.id_traslado}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-satoshi-black ${
                  t.estado === 'EN_TRANSITO' ? 'bg-amber-950/80 text-amber-400 border border-amber-800/40' : 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/40'
                }`}>
                  {t.estado.replace('_', ' ')}
                </span>
              </div>
              <div className="flex items-center gap-3 text-sm font-satoshi-black text-white">
                <span className="text-slate-400">De:</span> {t.origen_nombre}
                <svg className="w-4 h-4 text-[#0DE8C0]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                <span className="text-slate-400">Hacia:</span> {t.destino_nombre}
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Enviado por {t.usuario_envia} el {new Date(t.fecha_envio).toLocaleString()}
              </p>
            </div>

            <div className="flex-1 max-w-sm bg-[#1D2935] p-3 rounded-xl border border-slate-700">
              <p className="text-[10px] text-slate-400 font-satoshi-black mb-2 uppercase">Productos a Mover:</p>
              <div className="space-y-1">
                {t.items.map((it: any, i: number) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="text-slate-300 truncate pr-4">{it.nombre}</span>
                    <span className="text-[#0DE8C0] font-mono font-bold shrink-0">{it.cantidad} unds</span>
                  </div>
                ))}
              </div>
            </div>

            {t.estado === 'EN_TRANSITO' && (
              <button
                onClick={() => handleRecibirTraslado(t)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-satoshi-black px-4 py-2.5 rounded-xl text-xs uppercase shadow transition shrink-0"
              >
                ✓ Marcar como Recibido
              </button>
            )}
          </div>
        ))}

        {filtrados.length === 0 && (
          <div className="text-center py-12 text-slate-400 text-xs bg-[#253443] rounded-2xl border border-slate-700">
            No hay traslados registrados en este estado.
          </div>
        )}
      </div>

      {/* MODAL CREAR TRASLADO */}
      {showModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#253443] border border-slate-700 rounded-2xl p-6 w-full max-w-2xl shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-700/60 pb-3">
              <h3 className="text-lg font-satoshi-black text-white uppercase">Generar Nuevo Traslado</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            {/* SELECCIÓN DE RUTAS */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-satoshi-black text-slate-400 uppercase mb-1">Bodega de Origen (Resta)</label>
                <select className="w-full bg-[#1D2935] border border-slate-700 rounded-xl p-2.5 text-xs text-white" value={origen} onChange={e => { setOrigen(e.target.value); setProdSeleccionado(''); }}>
                  <option value="">Selecciona origen...</option>
                  {sedesOrigenPermitidas.map(s => <option key={s.id_sucursal} value={s.id_sucursal}>{s.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-satoshi-black text-[#0DE8C0] uppercase mb-1">Bodega de Destino (Suma)</label>
                <select className="w-full bg-[#1D2935] border border-[#0DE8C0]/50 rounded-xl p-2.5 text-xs text-white" value={destino} onChange={e => setDestino(e.target.value)}>
                  <option value="">Selecciona destino...</option>
                  {sucursales.filter(s => s.estado !== 'INACTIVA').map(s => <option key={s.id_sucursal} value={s.id_sucursal}>{s.nombre}</option>)}
                </select>
              </div>
            </div>

            {/* CARRITO DE TRASLADO CON BUSCADOR INTELIGENTE */}
            <div className="bg-[#1D2935] p-4 rounded-xl border border-slate-700 space-y-3">
              <label className="block text-[10px] font-satoshi-black text-slate-400 uppercase">Agregar Productos</label>
              
              <div className="flex gap-2 relative">
                
                {/* BUSCADOR CUSTOMIZADO */}
                <div className="relative flex-1">
                  <div 
                    onClick={() => {
                      if (!origen) return alert("Selecciona la bodega de origen primero");
                      setIsProdDropdownOpen(!isProdDropdownOpen);
                    }}
                    className={`w-full bg-[#253443] border border-slate-700 rounded-lg p-2 text-xs text-white flex justify-between items-center cursor-pointer ${!origen ? 'opacity-50' : 'hover:border-[#0DE8C0]'}`}
                  >
                    <span className="truncate">
                      {prodSeleccionado 
                        ? (() => {
                            const p = productos.find(x => x.sku === prodSeleccionado);
                            return p ? `${p.nombre} (Disp: ${p.stock?.[origen] || 0})` : 'Seleccionar Producto...';
                          })()
                        : 'Buscar por Nombre o SKU...'}
                    </span>
                    <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                  </div>

                  {isProdDropdownOpen && origen && (
                    <div className="absolute z-50 w-full mt-1 bg-[#1a2332] border border-slate-600 rounded-lg shadow-2xl flex flex-col max-h-56 overflow-hidden">
                      <div className="p-2 border-b border-slate-700">
                        <input
                          type="text"
                          placeholder="Escribe para filtrar..."
                          className="w-full bg-[#253443] border border-slate-700 rounded-md p-1.5 text-xs text-white focus:outline-none focus:border-[#0DE8C0]"
                          value={searchProd}
                          onChange={(e) => setSearchProd(e.target.value)}
                          autoFocus
                        />
                      </div>
                      <div className="overflow-y-auto">
                        {productosBusqueda.map(p => (
                          <div
                            key={p.sku}
                            className="p-2.5 text-xs border-b border-slate-800/50 hover:bg-[#253443] cursor-pointer transition"
                            onClick={() => {
                              setProdSeleccionado(p.sku);
                              setIsProdDropdownOpen(false);
                              setSearchProd('');
                            }}
                          >
                            <div className="font-satoshi-black text-white">{p.nombre}</div>
                            <div className="text-[10px] text-[#0DE8C0] mt-0.5">
                              SKU: {p.sku} | <span className="font-mono text-slate-300">Disp: {p.stock?.[origen] || 0} unds</span>
                            </div>
                          </div>
                        ))}
                        {productosBusqueda.length === 0 && (
                          <div className="p-4 text-xs text-slate-500 text-center">No hay productos disponibles en esta sede.</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* CAMPO DE CANTIDAD (SIN FLECHAS) */}
                <input 
                  type="number" 
                  min="1" 
                  placeholder="Cant." 
                  className="w-20 bg-[#253443] border border-slate-700 focus:border-[#0DE8C0] focus:outline-none rounded-lg p-2 text-xs text-center text-white font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none shrink-0" 
                  value={cantSeleccionada} 
                  onChange={e => setCantSeleccionada(Number(e.target.value))} 
                />
                
                <button type="button" onClick={handleAddItem} className="bg-[#0DE8C0] hover:bg-[#0bcfa8] text-[#1D2935] px-4 rounded-lg font-black transition shrink-0">
                  +
                </button>
              </div>

              {/* LISTA A ENVIAR */}
              <div className="mt-4 space-y-2">
                {itemsTraslado.map((it, i) => (
                  <div key={i} className="flex justify-between items-center bg-[#253443] p-2.5 rounded-lg text-xs border border-slate-700/50">
                    <span className="text-white font-satoshi-black truncate pr-2">{it.nombre}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[#0DE8C0] font-mono font-bold">{it.cantidad} unds</span>
                      <button onClick={() => handleRemoveItem(it.sku)} className="text-red-400 hover:bg-red-950 p-1 rounded transition">✕</button>
                    </div>
                  </div>
                ))}
                {itemsTraslado.length === 0 && (
                  <p className="text-[10px] text-slate-500 italic text-center py-2">No hay productos en el envío.</p>
                )}
              </div>
            </div>

            {/* BOTONES */}
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowModal(false)} className="flex-1 bg-[#1D2935] hover:bg-slate-800 text-slate-300 py-3 rounded-xl text-xs uppercase font-satoshi-black border border-slate-700 transition">Cancelar</button>
              <button onClick={handleGenerarTraslado} disabled={loading || itemsTraslado.length === 0} className="flex-1 bg-[#0DE8C0] hover:bg-[#0bcfa8] text-[#1D2935] py-3 rounded-xl text-xs uppercase font-satoshi-black disabled:opacity-50 transition shadow-lg">
                {loading ? 'Generando...' : 'Generar Traslado'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
