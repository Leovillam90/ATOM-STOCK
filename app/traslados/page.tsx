'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, doc, writeBatch, deleteDoc } from 'firebase/firestore';
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
  const [filtroEstado, setFiltroEstado] = useState<'TODOS' | 'EN_TRANSITO' | 'COMPLETADO' | 'ANULADO'>('TODOS');

  // Modal Nuevo Traslado
  const [showModal, setShowModal] = useState(false);
  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  
  // NUVOS CAMPOS: Guía y Transportadora
  const [transportadoraTraslado, setTransportadoraTraslado] = useState('');
  const [guiaTraslado, setGuiaTraslado] = useState('');
  
  // Carrito interno del traslado
  const [itemsTraslado, setItemsTraslado] = useState<any[]>([]);
  const [prodSeleccionado, setProdSeleccionado] = useState('');
  const [cantSeleccionada, setCantSeleccionada] = useState<number | ''>('');

  // Estados para el Buscador de Productos Customizado
  const [isProdDropdownOpen, setIsProdDropdownOpen] = useState(false);
  const [searchProd, setSearchProd] = useState('');

  const [loading, setLoading] = useState(false);

  // Modal Anular Traslado (SOLO ADMIN)
  const [showModalAnular, setShowModalAnular] = useState(false);
  const [trasladoAAnular, setTrasladoAAnular] = useState<any>(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState('');
  const [isAnulando, setIsAnulando] = useState(false);

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
    
    let asignadas = Array.isArray(userAuth.sedes_asignadas) 
      ? userAuth.sedes_asignadas 
      : (userAuth.id_sucursal ? [userAuth.id_sucursal] : []);
      
    return sucursales.filter(s => s.estado !== 'INACTIVA' && asignadas.includes(s.id_sucursal));
  }, [sucursales, userAuth]);

  // Lógica del buscador de productos custom
  const productosBusqueda = useMemo(() => {
    const term = searchProd.toLowerCase().trim();
    return productos.filter(p => {
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
  // PASO 1: ENVIAR TRASLADO (OPTIMIZADO CON BATCHING)
  // ==========================================
  const handleGenerarTraslado = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!origen || !destino) return alert('Selecciona origen y destino.');
    if (origen === destino) return alert('El origen y destino no pueden ser la misma sede.');
    if (!transportadoraTraslado.trim() || !guiaTraslado.trim()) return alert('Debes ingresar la transportadora y el número de guía.');
    if (itemsTraslado.length === 0) return alert('Agrega al menos un producto al traslado.');

    setLoading(true);
    try {
      const batchArray: any[] = [writeBatch(db)];
      let batchIndex = 0;
      let opCount = 0;

      const idTraslado = `TRAS_${Date.now().toString().slice(-6)}`;
      const fechaISO = new Date().toISOString();

      const nomOrigen = sucursales.find(s => s.id_sucursal === origen)?.nombre || origen;
      const nomDestino = sucursales.find(s => s.id_sucursal === destino)?.nombre || destino;

      // 1. Registrar el traslado
      const trasladoRef = doc(db, 'traslados', idTraslado);
      batchArray[batchIndex].set(trasladoRef, {
        id_cuenta: userAuth.id_cuenta,
        id_traslado: idTraslado,
        origen_id: origen,
        origen_nombre: nomOrigen,
        destino_id: destino,
        destino_nombre: nomDestino,
        transportadora: transportadoraTraslado.trim().toUpperCase(),
        numero_guia: guiaTraslado.trim(),
        items: itemsTraslado,
        estado: 'EN_TRANSITO',
        fecha_envio: fechaISO,
        usuario_envia: userAuth.nombre || 'Usuario LOBO'
      });
      opCount++;

      // 2. Restar stock del origen en lotes
      itemsTraslado.forEach(item => {
        const prodRef = doc(db, 'productos', item.sku);
        const prodData = productos.find(p => p.sku === item.sku);
        const stockActual = prodData?.stock || {};
        
        const nuevoStock = { 
          ...stockActual, 
          [origen]: Math.max(0, (Number(stockActual[origen]) || 0) - item.cantidad) 
        };

        batchArray[batchIndex].set(prodRef, { 
          stock: nuevoStock,
          fecha_actualizacion: fechaISO
        }, { merge: true });

        opCount++;
        if (opCount >= 450) {
          batchArray.push(writeBatch(db));
          batchIndex++;
          opCount = 0;
        }
      });

      for (const b of batchArray) {
        await b.commit();
      }
      
      alert('¡Traslado generado! La mercancía ahora está EN TRÁNSITO.');
      setShowModal(false);
      setItemsTraslado([]);
      setOrigen('');
      setDestino('');
      setTransportadoraTraslado('');
      setGuiaTraslado('');
    } catch (error: any) {
      alert('Error: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // PASO 2: RECIBIR TRASLADO (OPTIMIZADO CON BATCHING)
  // ==========================================
  const handleRecibirTraslado = async (traslado: any) => {
    if (!confirm('¿Confirmas que recibiste la mercancía físicamente en la sede de destino?')) return;

    try {
      const batchArray: any[] = [writeBatch(db)];
      let batchIndex = 0;
      let opCount = 0;
      const fechaISO = new Date().toISOString();

      const trasladoRef = doc(db, 'traslados', traslado.id_traslado);
      batchArray[batchIndex].set(trasladoRef, {
        estado: 'COMPLETADO',
        fecha_recepcion: fechaISO,
        usuario_recibe: userAuth.nombre || 'Usuario LOBO'
      }, { merge: true });
      opCount++;

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

        batchArray[batchIndex].set(prodRef, { 
          stock: nuevoStock,
          historial_cambios: historialActualizado,
          fecha_actualizacion: fechaISO
        }, { merge: true });

        opCount++;
        if (opCount >= 450) {
          batchArray.push(writeBatch(db));
          batchIndex++;
          opCount = 0;
        }
      });

      for (const b of batchArray) {
        await b.commit();
      }

      alert('¡Mercancía recibida e inventario actualizado!');

    } catch (error: any) {
      alert('Error al recibir: ' + error.message);
    }
  };

  // ==========================================
  // 🛡️ ANULAR TRASLADO (SÓLO ADMIN CON BATCHING)
  // ==========================================
  const handleOpenAnular = (t: any) => {
    if (userAuth?.rol !== 'ADMIN') return alert('Solo el administrador puede anular traslados.');
    setTrasladoAAnular(t);
    setMotivoAnulacion('');
    setShowModalAnular(true);
  };

  const handleConfirmarAnulacion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trasladoAAnular) return;
    if (!motivoAnulacion.trim()) {
      return alert('Por favor ingresa la justificación o motivo de la anulación.');
    }

    setIsAnulando(true);
    try {
      const docId = trasladoAAnular.id_doc || trasladoAAnular.id_traslado;
      const estadoAnterior = trasladoAAnular.estado;
      const origenSede = trasladoAAnular.origen_id;
      const destinoSede = trasladoAAnular.destino_id;
      const fechaISO = new Date().toISOString();

      const batchArray: any[] = [writeBatch(db)];
      let batchIndex = 0;
      let opCount = 0;

      const trasladoRef = doc(db, 'traslados', docId);
      
      const nuevoCambioAuditoria = {
        fecha: fechaISO,
        usuario_nombre: userAuth?.nombre || 'Administrador',
        motivo: motivoAnulacion.trim(),
        accion: estadoAnterior === 'EN_TRANSITO' ? 'ANULACIÓN_TRANSITO' : 'ANULACIÓN_COMPLETO'
      };

      const historialAnterior = Array.isArray(trasladoAAnular.historial_cambios) ? trasladoAAnular.historial_cambios : [];

      batchArray[batchIndex].set(trasladoRef, {
        estado: 'ANULADO',
        fecha_anulacion: fechaISO,
        usuario_anulo: userAuth?.nombre || 'Administrador',
        historial_cambios: [nuevoCambioAuditoria, ...historialAnterior]
      }, { merge: true });
      opCount++;

      if (Array.isArray(trasladoAAnular.items)) {
        for (const item of trasladoAAnular.items) {
          if (item.sku) {
            const prodRef = doc(db, 'productos', item.sku);
            const prodObj = productos.find(p => p.sku === item.sku);

            if (prodObj) {
              const currentStockMap = prodObj.stock || {};
              let stockRestablecidoOrigen = Number(currentStockMap[origenSede] || 0);
              let stockRestablecidoDestino = Number(currentStockMap[destinoSede] || 0);

              if (estadoAnterior === 'EN_TRANSITO') {
                stockRestablecidoOrigen += Number(item.cantidad);
              } else if (estadoAnterior === 'COMPLETADO') {
                stockRestablecidoDestino = Math.max(0, stockRestablecidoDestino - Number(item.cantidad));
                stockRestablecidoOrigen += Number(item.cantidad);
              }

              batchArray[batchIndex].set(prodRef, {
                stock: {
                  ...currentStockMap,
                  [origenSede]: stockRestablecidoOrigen,
                  [destinoSede]: stockRestablecidoDestino
                }
              }, { merge: true });

              opCount++;
              if (opCount >= 450) {
                batchArray.push(writeBatch(db));
                batchIndex++;
                opCount = 0;
              }
            }
          }
        }
      }

      for (const b of batchArray) {
        await b.commit();
      }

      alert(`Traslado N° ${trasladoAAnular.id_traslado} ANULADO exitosamente y stock restablecido.`);
      setShowModalAnular(false);
      setTrasladoAAnular(null);
    } catch (err: any) {
      console.error(err);
      alert('Error al anular el traslado: ' + err.message);
    } finally {
      setIsAnulando(false);
    }
  };

  const handleDeleteTraslado = async (t: any) => {
    if (userAuth?.rol !== 'ADMIN') return alert('Solo el administrador puede eliminar traslados de la bitácora.');
    if (!confirm(`¿Estás TOTALMENTE SEGURO de eliminar el traslado ${t.id_traslado}? Esta acción NO devuelve inventario y borra el registro permanentemente.`)) return;

    try {
      await deleteDoc(doc(db, 'traslados', t.id_doc || t.id_traslado));
      alert('Traslado eliminado permanentemente.');
    } catch (err: any) {
      alert('Error al eliminar: ' + err.message);
    }
  };

  const { filtrados, totalTransito, totalCompletados } = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const result = traslados.filter(t => {
      const match = t.id_traslado.toLowerCase().includes(q) || 
                    t.origen_nombre.toLowerCase().includes(q) || 
                    t.destino_nombre.toLowerCase().includes(q) ||
                    (t.numero_guia && t.numero_guia.toLowerCase().includes(q)) ||
                    (t.transportadora && t.transportadora.toLowerCase().includes(q));
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

  const esAdmin = userAuth?.rol === 'ADMIN';

  return (
    <div className="min-h-screen bg-[#F4F5F7] text-gray-800 p-6 md:p-10 font-sans relative pb-20">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 border-b border-gray-200 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FFD800] border border-gray-800 animate-pulse"></span>
            <span className="text-[11px] font-satoshi-black text-gray-900 uppercase tracking-wider font-bold">
              Logística y Movimientos Internos
            </span>
          </div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight font-satoshi-black">
            Traslados de Mercancía
          </h1>
          <p className="text-xs text-gray-500 mt-1 font-satoshi-regular">
            Envía inventario entre bodegas. El stock se restará al enviar y se sumará al confirmar la recepción.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setOrigen('');
            setDestino('');
            setTransportadoraTraslado('');
            setGuiaTraslado('');
            setItemsTraslado([]);
            setProdSeleccionado('');
            setIsProdDropdownOpen(false);
            setShowModal(true);
          }}
          className="bg-[#FFD800] hover:bg-[#FDCB13] text-[#222222] font-satoshi-black px-6 py-3.5 rounded-xl text-xs uppercase tracking-wider transition-all shadow-sm flex items-center gap-2 font-bold shrink-0"
        >
          <svg className="w-4 h-4 text-[#222222]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
          </svg>
          <span>Nuevo Traslado</span>
        </button>
      </div>

      {/* KPIS CON ÍCONOS SVG 2D */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white border border-amber-200 rounded-2xl p-5 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-satoshi-black text-amber-800 uppercase tracking-wider font-bold block">
              EN TRÁNSITO (ESPERANDO RECEPCIÓN)
            </span>
            <div className="text-4xl font-black text-gray-900 font-satoshi-black mt-1">{totalTransito}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#222222] text-[#FFD800] flex items-center justify-center shrink-0 shadow-sm">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>

        <div className="bg-white border border-emerald-200 rounded-2xl p-5 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-satoshi-black text-emerald-800 uppercase tracking-wider font-bold block">
              TRASLADOS COMPLETADOS
            </span>
            <div className="text-4xl font-black text-gray-900 font-satoshi-black mt-1">{totalCompletados}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#222222] text-[#FFD800] flex items-center justify-center shrink-0 shadow-sm">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
      </div>

      {/* FILTROS */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-8 flex flex-wrap gap-4 items-center justify-between shadow-sm">
        <div className="relative w-full md:w-80">
          <svg className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input 
            type="text" 
            className="w-full bg-gray-50 border border-gray-300 focus:border-[#FFD800] focus:ring-2 focus:ring-[#FFD800]/20 rounded-xl pl-10 pr-3 py-2.5 text-xs text-gray-900 placeholder-gray-400 focus:outline-none transition-all font-satoshi-regular"
            placeholder="Buscar ID, Guía, Origen o Destino..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex gap-2">
          {['TODOS', 'EN_TRANSITO', 'COMPLETADO', 'ANULADO'].map(est => (
            <button
              key={est}
              onClick={() => setFiltroEstado(est as any)}
              className={`px-4 py-2 rounded-xl text-xs font-satoshi-black transition ${
                filtroEstado === est 
                  ? 'bg-[#FFD800] text-[#222222] font-bold shadow-sm' 
                  : 'bg-gray-100 text-gray-500 hover:text-gray-900 border border-gray-200'
              }`}
            >
              {est.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* LISTA DE TRASLADOS */}
      <div className="space-y-4">
        {filtrados.map((t, idx) => {
          const isAnulado = t.estado === 'ANULADO';

          return (
            <div key={idx} className={`bg-white border ${isAnulado ? 'border-red-200' : 'border-gray-200'} rounded-2xl p-5 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-gray-300 transition-all`}>
              
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-gray-800 bg-gray-100 px-2 py-1 rounded border border-gray-200 font-bold">
                    {t.id_traslado}
                  </span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-satoshi-black font-bold ${
                    t.estado === 'EN_TRANSITO' 
                      ? 'bg-amber-100 text-amber-800 border border-amber-200' 
                      : (isAnulado ? 'bg-red-100 text-red-800 border border-red-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200')
                  }`}>
                    {t.estado.replace('_', ' ')}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-sm font-satoshi-black text-gray-900">
                  <span className="text-gray-500 font-normal">De:</span> {t.origen_nombre}
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                  <span className="text-gray-500 font-normal">Hacia:</span> {t.destino_nombre}
                </div>

                <div className="flex items-center gap-3 text-[10px] text-gray-600 mt-1">
                  <span className="font-bold">Transportadora:</span> {t.transportadora || 'N/A'}
                  <span className="font-bold border-l border-gray-300 pl-3">Guía:</span> <span className="font-mono bg-gray-100 px-1.5 rounded">{t.numero_guia || 'N/A'}</span>
                </div>

                {/* TRAZABILIDAD Y AUDITORÍA DE USUARIOS */}
                <div className="space-y-1 pt-1 border-t border-gray-100 text-[11px] mt-2">
                  <div className="text-gray-600 flex items-center gap-1">
                    <span className="text-gray-500 font-satoshi-black font-bold">ENVÍA:</span> 
                    <span className="font-satoshi-black text-gray-900">{t.usuario_envia || 'N/A'}</span>
                    <span className="text-gray-400 font-mono text-[10px]">({new Date(t.fecha_envio).toLocaleString()})</span>
                  </div>

                  {t.estado === 'COMPLETADO' && (
                    <div className="text-emerald-700 flex items-center gap-1">
                      <span className="text-emerald-800 font-satoshi-black font-bold">RECIBE:</span> 
                      <span className="font-satoshi-black text-emerald-900">{t.usuario_recibe || 'N/A'}</span>
                      <span className="text-gray-400 font-mono text-[10px]">({t.fecha_recepcion ? new Date(t.fecha_recepcion).toLocaleString() : 'N/A'})</span>
                    </div>
                  )}

                  {isAnulado && (
                    <div className="text-red-700 flex flex-col gap-0.5 pt-1">
                      <span className="text-red-800 font-satoshi-black font-bold flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        ANULADO POR: {t.usuario_anulo || 'Admin'}
                      </span> 
                      <span className="text-gray-500 font-mono text-[10px]">({t.fecha_anulacion ? new Date(t.fecha_anulacion).toLocaleString() : 'N/A'})</span>
                      <span className="text-gray-600 italic max-w-sm border-l-2 border-red-300 pl-2 mt-1">&quot;{t.historial_cambios?.[0]?.motivo}&quot;</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 w-full max-w-sm bg-gray-50 p-3 rounded-xl border border-gray-200 shrink-0">
                <p className="text-[10px] text-gray-500 font-satoshi-black mb-2 uppercase font-bold">Productos a Mover:</p>
                <div className="space-y-1">
                  {t.items.map((it: any, i: number) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-gray-700 truncate pr-4">{it.nombre}</span>
                      <span className="text-gray-900 font-mono font-bold shrink-0">{it.cantidad} unds</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* BOTONERA DE ACCIONES */}
              <div className="flex flex-col gap-2 shrink-0 w-full md:w-auto">
                {t.estado === 'EN_TRANSITO' && (
                  <button
                    onClick={() => handleRecibirTraslado(t)}
                    className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-satoshi-black font-bold px-4 py-2.5 rounded-xl text-xs uppercase shadow-sm transition flex items-center justify-center gap-1.5"
                  >
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Marcar como Recibido</span>
                  </button>
                )}

                {/* OPCIONES DE ADMINISTRADOR */}
                {esAdmin && (
                  <div className="flex items-center gap-2 justify-end w-full">
                    {!isAnulado && (
                      <button
                        onClick={() => handleOpenAnular(t)}
                        className="bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 font-satoshi-black font-bold px-3 py-1.5 rounded-lg text-xs transition flex items-center justify-center gap-1"
                        title="Anular y devolver inventario a origen"
                      >
                        <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                        </svg>
                        <span>Anular</span>
                      </button>
                    )}
                    
                    <button
                      onClick={() => handleDeleteTraslado(t)}
                      className="bg-red-50 border border-red-200 hover:bg-red-100 text-red-600 font-satoshi-black font-bold p-1.5 rounded-lg transition"
                      title="Eliminar registro permanentemente (Peligro)"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {filtrados.length === 0 && (
          <div className="text-center py-12 text-gray-500 text-xs bg-white rounded-2xl border border-gray-200">
            No hay traslados registrados en este estado.
          </div>
        )}
      </div>

      {/* MODAL CREAR TRASLADO */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-2xl shadow-2xl space-y-4 text-gray-800">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <h3 className="text-lg font-satoshi-black text-gray-900 uppercase font-bold">Generar Nuevo Traslado</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-700 transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleGenerarTraslado} className="space-y-4">
              {/* SELECCIÓN DE RUTAS */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-satoshi-black text-gray-600 uppercase mb-1 font-bold">Bodega de Origen (Resta)</label>
                  <select className="w-full bg-gray-50 border border-gray-300 focus:border-[#FFD800] focus:ring-2 focus:ring-[#FFD800]/20 rounded-xl p-2.5 text-xs text-gray-900 font-satoshi-black focus:outline-none transition-all" value={origen} onChange={e => { setOrigen(e.target.value); setProdSeleccionado(''); }}>
                    <option value="">Selecciona origen...</option>
                    {sedesOrigenPermitidas.map(s => <option key={s.id_sucursal} value={s.id_sucursal}>{s.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-satoshi-black text-gray-900 uppercase mb-1 font-bold">Bodega de Destino (Suma)</label>
                  <select className="w-full bg-gray-50 border border-gray-300 focus:border-[#FFD800] focus:ring-2 focus:ring-[#FFD800]/20 rounded-xl p-2.5 text-xs text-gray-900 font-satoshi-black focus:outline-none transition-all" value={destino} onChange={e => setDestino(e.target.value)}>
                    <option value="">Selecciona destino...</option>
                    {sucursales.filter(s => s.estado !== 'INACTIVA').map(s => <option key={s.id_sucursal} value={s.id_sucursal}>{s.nombre}</option>)}
                  </select>
                </div>
              </div>

              {/* SELECCIÓN DE TRANSPORTADORA Y GUÍA (NUEVOS CAMPOS) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-satoshi-black text-gray-600 uppercase mb-1 font-bold">Transportadora *</label>
                  <input 
                    type="text"
                    placeholder="Ej: Interrapidisimo, Envía..."
                    className="w-full bg-gray-50 border border-gray-300 focus:border-[#FFD800] focus:ring-2 focus:ring-[#FFD800]/20 rounded-xl p-2.5 text-xs text-gray-900 font-satoshi-regular focus:outline-none transition-all"
                    value={transportadoraTraslado}
                    onChange={(e) => setTransportadoraTraslado(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-satoshi-black text-gray-600 uppercase mb-1 font-bold">Número de Guía *</label>
                  <input 
                    type="text"
                    placeholder="Ej: 2100456789"
                    className="w-full bg-gray-50 border border-gray-300 focus:border-[#FFD800] focus:ring-2 focus:ring-[#FFD800]/20 rounded-xl p-2.5 text-xs text-gray-900 font-mono focus:outline-none transition-all"
                    value={guiaTraslado}
                    onChange={(e) => setGuiaTraslado(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* CARRITO DE TRASLADO CON BUSCADOR INTELIGENTE */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-3">
                <label className="block text-[10px] font-satoshi-black text-gray-600 uppercase font-bold">Agregar Productos</label>
                
                <div className="flex gap-2 relative">
                  
                  {/* BUSCADOR CUSTOMIZADO */}
                  <div className="relative flex-1">
                    <div 
                      onClick={() => {
                        if (!origen) return alert("Selecciona la bodega de origen primero");
                        setIsProdDropdownOpen(!isProdDropdownOpen);
                      }}
                      className={`w-full bg-gray-50 border border-gray-300 rounded-lg p-2 text-xs text-gray-900 flex justify-between items-center cursor-pointer transition-all ${!origen ? 'opacity-50' : 'hover:border-[#FFD800]'}`}
                    >
                      <span className="truncate">
                        {prodSeleccionado 
                          ? (() => {
                              const p = productos.find(x => x.sku === prodSeleccionado);
                              return p ? `${p.nombre} (Disp: ${p.stock?.[origen] || 0})` : 'Seleccionar Producto...';
                            })()
                          : 'Buscar por Nombre o SKU...'}
                      </span>
                      <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                    </div>

                    {isProdDropdownOpen && origen && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl flex flex-col max-h-56 overflow-hidden">
                        <div className="p-2 border-b border-gray-100">
                          <input
                            type="text"
                            placeholder="Escribe para filtrar..."
                            className="w-full bg-gray-50 border border-gray-300 rounded-md p-1.5 text-xs text-gray-900 focus:outline-none focus:border-[#FFD800]"
                            value={searchProd}
                            onChange={(e) => setSearchProd(e.target.value)}
                            autoFocus
                          />
                        </div>
                        <div className="overflow-y-auto">
                          {productosBusqueda.map(p => (
                            <div
                              key={p.sku}
                              className="p-2.5 text-xs border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition"
                              onClick={() => {
                                setProdSeleccionado(p.sku);
                                setIsProdDropdownOpen(false);
                                setSearchProd('');
                              }}
                            >
                              <div className="font-satoshi-black text-gray-900 font-bold">{p.nombre}</div>
                              <div className="text-[10px] text-gray-500 mt-0.5">
                                SKU: {p.sku} | <span className="font-mono text-gray-700 font-bold">Disp: {p.stock?.[origen] || 0} unds</span>
                              </div>
                            </div>
                          ))}
                          {productosBusqueda.length === 0 && (
                            <div className="p-4 text-xs text-gray-500 text-center">No hay productos disponibles en esta sede.</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* CAMPO DE CANTIDAD */}
                  <input 
                    type="number" 
                    min="1" 
                    placeholder="Cant." 
                    className="w-20 bg-gray-50 border border-gray-300 focus:border-[#FFD800] focus:ring-2 focus:ring-[#FFD800]/20 focus:outline-none rounded-lg p-2 text-xs text-center text-gray-900 font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none shrink-0" 
                    value={cantSeleccionada} 
                    onChange={e => setCantSeleccionada(Number(e.target.value))} 
                  />
                  
                  <button type="button" onClick={handleAddItem} className="bg-[#FFD800] hover:bg-[#FDCB13] text-[#222222] px-4 rounded-lg font-black transition shrink-0">
                    +
                  </button>
                </div>

                {/* LISTA A ENVIAR */}
                <div className="mt-4 space-y-2">
                  {itemsTraslado.map((it, i) => (
                    <div key={i} className="flex justify-between items-center bg-white p-2.5 rounded-lg text-xs border border-gray-200 shadow-xs">
                      <span className="text-gray-900 font-satoshi-black font-bold truncate pr-2">{it.nombre}</span>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-gray-900 font-mono font-bold">{it.cantidad} unds</span>
                        <button type="button" onClick={() => handleRemoveItem(it.sku)} className="text-red-500 hover:bg-red-50 p-1 rounded transition">
                          <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                  {itemsTraslado.length === 0 && (
                    <p className="text-[10px] text-gray-400 italic text-center py-2">No hay productos en el envío.</p>
                  )}
                </div>
              </div>

              {/* BOTONES */}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-xl text-xs uppercase font-satoshi-black border border-gray-300 transition-colors">Cancelar</button>
                <button type="submit" disabled={loading || itemsTraslado.length === 0} className="flex-1 bg-[#FFD800] hover:bg-[#FDCB13] text-[#222222] font-bold py-3 rounded-xl text-xs uppercase font-satoshi-black disabled:opacity-50 transition-colors shadow-sm">
                  {loading ? 'Generando...' : 'Generar Traslado'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL ANULAR TRASLADO (SOLO ADMIN) */}
      {showModalAnular && trasladoAAnular && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-md shadow-2xl font-sans space-y-4 text-gray-800">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <h3 className="text-lg font-satoshi-black text-gray-900 uppercase font-bold">Anular Traslado</h3>
              <button onClick={() => setShowModalAnular(false)} className="text-gray-400 hover:text-gray-700">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl">
              <p className="text-xs text-amber-800 font-satoshi-black font-bold">⚠️ Atención: Reversión de Inventario</p>
              <p className="text-[11px] text-amber-700 mt-1">Al anular este traslado (ID: {trasladoAAnular.id_traslado}), el stock de los productos regresará inmediatamente a la bodega de origen (<span className="font-bold">{trasladoAAnular.origen_nombre}</span>).</p>
            </div>

            <form onSubmit={handleConfirmarAnulacion} className="space-y-4">
              <div>
                <label className="block text-xs font-satoshi-black text-gray-700 uppercase mb-2 font-bold">Justificación de la Anulación *</label>
                <textarea
                  rows={3}
                  className="w-full bg-gray-50 border border-gray-300 rounded-xl p-3 text-xs text-gray-900 focus:outline-none focus:border-[#FFD800] focus:ring-2 focus:ring-[#FFD800]/20 transition-all font-satoshi-regular"
                  placeholder="Ej: Traslado enviado por error, mercancía dañada, etc."
                  value={motivoAnulacion}
                  onChange={(e) => setMotivoAnulacion(e.target.value)}
                  required
                />
              </div>

              <div className="flex gap-3">
                <button type="button" onClick={() => setShowModalAnular(false)} className="flex-1 bg-gray-100 text-gray-700 font-satoshi-black py-3 rounded-xl text-xs uppercase hover:bg-gray-200 transition-colors">Cancelar</button>
                <button type="submit" disabled={isAnulando || !motivoAnulacion.trim()} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-satoshi-black py-3 rounded-xl text-xs uppercase disabled:opacity-50 transition-colors font-bold shadow-sm">
                  {isAnulando ? 'Anulando...' : 'Confirmar Anulación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
