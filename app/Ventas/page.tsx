'use client';

import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function VentasPage() {
  const [userAuth, setUserAuth] = useState<any>(null);
  const [ventas, setVentas] = useState<any[]>([]);
  const [productos, setProductos] = useState<any[]>([]);
  const [sucursales, setSucursales] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);

  // Pestañas Principales: Nueva Venta POS / Historial
  const [activeTab, setActiveTab] = useState<'POS' | 'HISTORIAL'>('POS');

  // Estado POS (Terminal)
  const [sedeDespacho, setSedeDespacho] = useState<string>('');
  const [searchProd, setSearchQueryProd] = useState('');
  const [cart, setCart] = useState<any[]>([]);
  const [clienteSel, setClienteSel] = useState<string>('CF_GENERAL');
  const [metodoPago, setMetodoPago] = useState<'EFECTIVO' | 'TRANSFERENCIA' | 'TARJETA'>('EFECTIVO');
  const [isProcessing, setIsProcessing] = useState(false);

  // Modal Ticket / Recibo Generado
  const [selectedVentaTicket, setSelectedVentaTicket] = useState<any>(null);
  const [showTicketModal, setShowTicketModal] = useState(false);

  // Modal Anulación / Reversión de Venta
  const [showModalAnular, setShowModalAnular] = useState(false);
  const [ventaAAnular, setVentaAAnular] = useState<any>(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState('');
  const [isAnulando, setIsAnulando] = useState(false);

  // Filtros Historial
  const [searchHistorial, setSearchHistorial] = useState('');

  const formatoCOP = (v: number) => 
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v || 0);

  useEffect(() => {
    const savedUser = localStorage.getItem('atom_user_session');
    if (savedUser) {
      const u = JSON.parse(savedUser);
      setUserAuth(u);
      if (u.id_sucursal) {
        setSedeDespacho(u.id_sucursal);
      }
    }
  }, []);

  // Escuchar Firestore con Filtrado de Acceso por Perfil
  useEffect(() => {
    if (!userAuth || !userAuth.id_cuenta) return;

    const esVendedorRol = userAuth.rol === 'VENDEDOR';
    const nombreVendedor = userAuth.nombre;

    let qVent;
    if (esVendedorRol) {
      if (userAuth.id_usuario) {
        qVent = query(
          collection(db, 'ventas'),
          where('id_cuenta', '==', userAuth.id_cuenta),
          where('vendedor_id', '==', userAuth.id_usuario)
        );
      } else {
        qVent = query(
          collection(db, 'ventas'),
          where('id_cuenta', '==', userAuth.id_cuenta),
          where('vendedor_nombre', '==', nombreVendedor)
        );
      }
    } else {
      qVent = query(
        collection(db, 'ventas'),
        where('id_cuenta', '==', userAuth.id_cuenta)
      );
    }

    const unsubVent = onSnapshot(qVent, (snap) => {
      setVentas(snap.docs.map(d => ({ ...d.data(), id_doc: d.id })));
    });

    const qProd = query(collection(db, 'productos'), where('id_cuenta', '==', userAuth.id_cuenta));
    const unsubProd = onSnapshot(qProd, (snap) => {
      setProductos(snap.docs.map(d => ({ ...d.data(), sku: d.id })));
    });

    const qSuc = query(collection(db, 'sucursales'), where('id_cuenta', '==', userAuth.id_cuenta));
    const unsubSuc = onSnapshot(qSuc, (snap) => {
      const sucs = snap.docs.map(d => d.data());
      setSucursales(sucs);
      
      if (sucs.length > 0 && !sedeDespacho) {
        const idSucAcceso = userAuth.id_sucursal || sucs[0].id_sucursal;
        setSedeDespacho(idSucAcceso);
      }
    });

    const qCli = query(collection(db, 'clientes'), where('id_cuenta', '==', userAuth.id_cuenta));
    const unsubCli = onSnapshot(qCli, (snap) => {
      setClientes(snap.docs.map(d => d.data()));
    });

    return () => {
      unsubVent();
      unsubProd();
      unsubSuc();
      unsubCli();
    };
  }, [userAuth, sedeDespacho]);

  // Lógica del Carrito POS
  const addToCart = (prod: any) => {
    setCart(prev => {
      const idx = prev.findIndex(item => item.sku === prod.sku);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx].cantidad += 1;
        return copy;
      } else {
        return [...prev, {
          sku: prod.sku,
          nombre: prod.nombre,
          precio: prod.plocal || prod.precio || 0,
          cantidad: 1
        }];
      }
    });
  };

  const updateQuantity = (sku: string, delta: number) => {
    setCart(prev => {
      return prev.map(item => {
        if (item.sku === sku) {
          const nuevaCant = item.cantidad + delta;
          return nuevaCant > 0 ? { ...item, cantidad: nuevaCant } : null;
        }
        return item;
      }).filter(Boolean) as any[];
    });
  };

  const removeFromCart = (sku: string) => {
    setCart(prev => prev.filter(item => item.sku !== sku));
  };

  const totalCarrito = cart.reduce((acc, item) => acc + (item.precio * item.cantidad), 0);

  // Procesar Cobro POS
  const handleCobrarVenta = async () => {
    if (cart.length === 0) return alert('El carrito está vacío. Selecciona al menos un producto.');
    if (!sedeDespacho) return alert('Por favor selecciona la sede de despacho.');

    setIsProcessing(true);
    try {
      const idFactura = `FACT_${Date.now().toString().slice(-6)}`;
      const sucObj = sucursales.find(s => s.id_sucursal === sedeDespacho);
      const cliObj = clientes.find(c => (c.nit === clienteSel || c.id_cliente === clienteSel));

      const ventaData = {
        id_cuenta: userAuth.id_cuenta,
        id_factura: idFactura,
        fecha: new Date().toISOString(),
        fecha_cobro: new Date().toISOString(),
        id_bodega_despacho: sedeDespacho,
        nombre_bodega: sucObj ? (sucObj.nombre || sucObj.NOMBRE) : 'Sede Principal',
        vendedor_nombre: userAuth?.nombre || 'Cajero POS',
        vendedor_id: userAuth?.id_usuario || '',
        cliente_nombre: cliObj ? cliObj.nombre : 'Consumidor Final',
        cliente_nit: clienteSel,
        items: cart,
        metodo_pago: metodoPago,
        subtotal: totalCarrito,
        total: totalCarrito,
        estado: 'PAGADA'
      };

      await setDoc(doc(db, 'ventas', idFactura), ventaData, { merge: true });

      // Descontar Stock en Firestore
      for (const item of cart) {
        const prodRef = doc(db, 'productos', item.sku);
        const prodObj = productos.find(p => p.sku === item.sku);
        if (prodObj) {
          const currentStockMap = prodObj.stock || {};
          const currentVal = Number(currentStockMap[sedeDespacho] || 0);
          const newVal = Math.max(0, currentVal - item.cantidad);
          
          await setDoc(prodRef, {
            stock: {
              ...currentStockMap,
              [sedeDespacho]: newVal
            }
          }, { merge: true });
        }
      }

      setCart([]);
      setSelectedVentaTicket(ventaData);
      setShowTicketModal(true);
    } catch (err: any) {
      console.error(err);
      alert('Error al registrar cobro: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // ABRIR MODAL PARA ANULAR VENTA
  const handleOpenAnular = (v: any) => {
    setVentaAAnular(v);
    setMotivoAnulacion('');
    setShowModalAnular(true);
  };

  // PROCESAR REVERSIÓN / ANULACIÓN DE VENTA CON JUSTIFICACIÓN Y DEVOLUCIÓN DE STOCK
  const handleConfirmarAnulacion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ventaAAnular) return;
    if (!motivoAnulacion.trim()) {
      return alert('Por favor ingresa la justificación o motivo de la anulación.');
    }

    setIsAnulando(true);
    try {
      const docId = ventaAAnular.id_doc || ventaAAnular.id_factura;
      const idSedeDevolucion = ventaAAnular.id_bodega_despacho || sedeDespacho;

      // 1. Actualizar Estado e Histórico de Anulación en Firestore
      const updateData = {
        estado: 'ANULADA',
        motivo_anulacion: motivoAnulacion.trim(),
        fecha_anulacion: new Date().toISOString(),
        usuario_anulo_nombre: userAuth?.nombre || 'Usuario ATOM',
        usuario_anulo_id: userAuth?.id_usuario || ''
      };

      await setDoc(doc(db, 'ventas', docId), updateData, { merge: true });

      // 2. Recomponer / Sumar el Stock devuelto a la Sede
      if (Array.isArray(ventaAAnular.items)) {
        for (const item of ventaAAnular.items) {
          if (item.sku) {
            const prodRef = doc(db, 'productos', item.sku);
            const prodObj = productos.find(p => p.sku === item.sku);
            
            if (prodObj) {
              const currentStockMap = prodObj.stock || {};
              const stockActual = Number(currentStockMap[idSedeDevolucion] || 0);
              const stockDevuelto = stockActual + Number(item.cantidad || 1);

              await setDoc(prodRef, {
                stock: {
                  ...currentStockMap,
                  [idSedeDevolucion]: stockDevuelto
                }
              }, { merge: true });
            }
          }
        }
      }

      alert(`¡La venta N° ${ventaAAnular.id_factura} ha sido ANULADA!\n\n✓ Motivo registrado para auditoría.\n✓ El inventario ha sido restablecido en la bodega.`);
      setShowModalAnular(false);
      setVentaAAnular(null);
    } catch (err: any) {
      console.error(err);
      alert('Error al anular la venta: ' + err.message);
    } finally {
      setIsAnulando(false);
    }
  };

  const esVendedor = userAuth?.rol === 'VENDEDOR';

  // FILTRADO SECUNDARIO MEMORIA DE SEGURIDAD
  const ventasHistorialFiltradas = ventas.filter(v => {
    if (esVendedor) {
      const coincideId = userAuth?.id_usuario && v.vendedor_id === userAuth.id_usuario;
      const coincideNombre = v.vendedor_nombre === userAuth?.nombre;
      if (!coincideId && !coincideNombre) {
        return false;
      }
    }

    const q = searchHistorial.toLowerCase().trim();
    return String(v.id_factura || '').toLowerCase().includes(q) ||
           String(v.cliente_nombre || '').toLowerCase().includes(q) ||
           String(v.nombre_bodega || '').toLowerCase().includes(q);
  });

  const productosPOS = productos.filter(p => {
    const q = searchProd.toLowerCase().trim();
    return String(p.nombre || '').toLowerCase().includes(q) || String(p.sku || '').toLowerCase().includes(q);
  });

  const sedeActivaObj = sucursales.find(s => s.id_sucursal === sedeDespacho);

  return (
    <div className="min-h-screen bg-[#1D2935] text-slate-100 p-4 md:p-8 font-sans relative pb-20">
      
      {/* CABECERA SUPERIOR Y NAVEGACIÓN PESTAÑAS */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 border-b border-slate-700/60 pb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight font-satoshi-black">
            Terminal de Ventas POS
          </h1>
          <p className="text-xs text-[#A0AEC0] mt-0.5 font-satoshi-regular">
            {esVendedor 
              ? `Cajero Activo: ${userAuth?.nombre || 'Mi Caja'} | Sede: ${sedeActivaObj ? (sedeActivaObj.nombre || sedeActivaObj.NOMBRE) : 'Mi Sede'}`
              : 'Cobro rápido en mostrador, despacho multibodega y facturación en tiempo real.'}
          </p>
        </div>

        {/* PESTAÑAS (POS / HISTORIAL) */}
        <div className="bg-[#253443] p-1 rounded-xl flex items-center gap-1 border border-slate-700/60 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('POS')}
            className={`px-4 py-2 rounded-lg text-xs font-satoshi-black transition flex items-center gap-2 ${
              activeTab === 'POS'
                ? 'bg-[#0DE8C0] text-[#1D2935] shadow-md'
                : 'text-[#A0AEC0] hover:text-white'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
            </svg>
            <span>Caja Registrar (POS)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('HISTORIAL')}
            className={`px-4 py-2 rounded-lg text-xs font-satoshi-black transition flex items-center gap-2 ${
              activeTab === 'HISTORIAL'
                ? 'bg-[#0DE8C0] text-[#1D2935] shadow-md'
                : 'text-[#A0AEC0] hover:text-white'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 01-2-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Mis Ventas Realizadas ({ventasHistorialFiltradas.length})</span>
          </button>
        </div>
      </div>

      {/* PESTAÑA 1: TERMINAL DE VENTAS (POS) */}
      {activeTab === 'POS' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* SECCIÓN IZQUIERDA: CATÁLOGO DE SELECCIÓN */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-[#253443] border border-slate-700/60 rounded-2xl p-3 shadow-lg">
              <div className="relative">
                <svg className="w-5 h-5 text-[#0DE8C0] absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input 
                  type="text" 
                  className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder-[#A0AEC0] focus:outline-none font-satoshi-regular transition"
                  placeholder="Escribe el nombre o escanea el código SKU..."
                  value={searchProd}
                  onChange={(e) => setSearchQueryProd(e.target.value)}
                  autoFocus
                />
              </div>
            </div>

            {/* GRID ÁGIL DE PRODUCTOS */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
              {productosPOS.map((prod, idx) => {
                const stockSede = Number(prod.stock?.[sedeDespacho] || 0);

                return (
                  <div
                    key={prod.sku || idx}
                    onClick={() => addToCart(prod)}
                    className="bg-[#253443] border border-slate-700/60 hover:border-[#0DE8C0] rounded-xl p-3 shadow-md flex flex-col justify-between transition-all duration-200 cursor-pointer active:scale-95 group"
                  >
                    <div>
                      <div className="w-full h-24 rounded-lg bg-[#1D2935] border border-slate-700/80 mb-2 overflow-hidden flex items-center justify-center shrink-0">
                        {prod.imagen_url ? (
                          <img src={prod.imagen_url} alt={prod.nombre} className="w-full h-full object-cover group-hover:scale-105 transition" />
                        ) : (
                          <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                          </svg>
                        )}
                      </div>

                      <h4 className="font-satoshi-black text-xs text-white uppercase truncate line-clamp-1">
                        {prod.nombre}
                      </h4>
                      <p className="font-mono text-[10px] text-[#A0AEC0]">SKU: {prod.sku}</p>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-700/60 flex items-center justify-between">
                      <span className="font-satoshi-black text-sm text-[#0DE8C0]">
                        {formatoCOP(prod.plocal || prod.precio || 0)}
                      </span>
                      <span className={`text-[9px] font-satoshi-black px-1.5 py-0.5 rounded ${
                        stockSede <= 0 ? 'bg-red-950/80 text-red-400' : 'bg-slate-800 text-slate-300'
                      }`}>
                        Stk: {stockSede}
                      </span>
                    </div>
                  </div>
                );
              })}

              {productosPOS.length === 0 && (
                <div className="col-span-full text-center py-16 bg-[#253443] border border-slate-700/50 rounded-2xl text-[#A0AEC0] text-xs font-satoshi-regular">
                  No se encontraron productos en el catálogo.
                </div>
              )}
            </div>
          </div>

          {/* SECCIÓN DERECHA: CARRITO Y PANEL DE COBRO */}
          <div className="lg:col-span-5 space-y-4">
            
            {/* INDICADOR DE SEDE */}
            <div className="bg-[#253443] border-2 border-[#0DE8C0]/50 rounded-2xl p-3.5 shadow-lg flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 truncate">
                <div className="w-8 h-8 rounded-lg bg-[#0DE8C0]/10 flex items-center justify-center text-[#0DE8C0] shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <div className="truncate">
                  <span className="text-[10px] font-satoshi-black text-[#A0AEC0] uppercase block">
                    {esVendedor ? 'Sede Asignada (Bloqueado)' : 'Sede Activa de Caja'}
                  </span>
                  <span className="text-xs font-satoshi-black text-white truncate block">
                    {sedeActivaObj ? (sedeActivaObj.nombre || sedeActivaObj.NOMBRE) : 'Seleccionar Sede'}
                  </span>
                </div>
              </div>

              <select
                className="bg-[#1D2935] border border-slate-700 text-xs font-satoshi-black text-[#0DE8C0] rounded-xl px-2.5 py-1.5 focus:outline-none cursor-pointer shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
                value={sedeDespacho}
                onChange={(e) => setSedeDespacho(e.target.value)}
                disabled={esVendedor}
              >
                {sucursales.filter(s => s.estado !== 'INACTIVA').map((s, idx) => (
                  <option key={s.id_sucursal || idx} value={s.id_sucursal} className="bg-[#1D2935] text-white">
                    {s.nombre || s.NOMBRE}
                  </option>
                ))}
              </select>
            </div>

            {/* CARRITO Y RESUMEN */}
            <div className="bg-[#253443] border border-slate-700/60 rounded-2xl p-5 shadow-xl flex flex-col justify-between min-h-[480px]">
              <div className="space-y-3">
                <div className="flex justify-between items-center border-b border-slate-700/60 pb-2">
                  <h3 className="text-xs font-satoshi-black text-white uppercase tracking-wider">
                    Carrito de Compra ({cart.reduce((a, c) => a + c.cantidad, 0)})
                  </h3>
                  {cart.length > 0 && (
                    <button 
                      type="button" 
                      onClick={() => setCart([])}
                      className="text-[11px] text-red-400 hover:underline font-satoshi-regular"
                    >
                      Vaciar
                    </button>
                  )}
                </div>

                <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
                  {cart.map((item) => (
                    <div key={item.sku} className="bg-[#1D2935] rounded-xl p-2.5 border border-slate-700/60 flex items-center justify-between gap-2">
                      <div className="truncate flex-1">
                        <div className="text-xs font-satoshi-black text-white truncate">{item.nombre}</div>
                        <div className="text-[10px] text-[#A0AEC0]">{formatoCOP(item.precio)} c/u</div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.sku, -1)}
                          className="w-6 h-6 bg-[#253443] text-white rounded-lg font-satoshi-black text-xs hover:bg-slate-700"
                        >
                          -
                        </button>
                        <span className="w-6 text-center font-satoshi-black text-xs text-white">{item.cantidad}</span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.sku, 1)}
                          className="w-6 h-6 bg-[#253443] text-white rounded-lg font-satoshi-black text-xs hover:bg-slate-700"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.sku)}
                          className="ml-1 text-slate-500 hover:text-red-400 text-xs"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}

                  {cart.length === 0 && (
                    <div className="text-center py-12 text-[#A0AEC0] text-xs font-satoshi-regular">
                      Haz clic en los productos para agregarlos al cobro.
                    </div>
                  )}
                </div>
              </div>

              {/* CONTROLES DE PAGO Y TOTAL A PAGAR */}
              <div className="space-y-4 pt-4 border-t border-slate-700/60">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-satoshi-black text-[#A0AEC0] uppercase mb-1">Cliente</label>
                    <select
                      className="w-full bg-[#1D2935] border border-slate-700 text-xs text-white rounded-xl p-2.5 focus:outline-none"
                      value={clienteSel}
                      onChange={(e) => setClienteSel(e.target.value)}
                    >
                      <option value="CF_GENERAL">Consumidor Final (CF)</option>
                      {clientes.map((c, idx) => (
                        <option key={c.id_cliente || idx} value={c.nit || c.id_cliente}>
                          {c.nombre}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-satoshi-black text-[#A0AEC0] uppercase mb-1">Método de Pago</label>
                    <select
                      className="w-full bg-[#1D2935] border border-slate-700 text-xs text-white font-satoshi-black rounded-xl p-2.5 focus:outline-none"
                      value={metodoPago}
                      onChange={(e: any) => setMetodoPago(e.target.value)}
                    >
                      <option value="EFECTIVO">💵 Efectivo</option>
                      <option value="TRANSFERENCIA">📲 Transferencia / Nequi</option>
                      <option value="TARJETA">💳 Tarjeta Débito/Crédito</option>
                    </select>
                  </div>
                </div>

                <div className="bg-[#1D2935] rounded-xl p-4 border border-slate-700/80 flex items-center justify-between">
                  <span className="text-xs font-satoshi-black text-[#A0AEC0] uppercase">Total a Pagar</span>
                  <span className="text-3xl font-black text-[#0DE8C0] font-satoshi-black">
                    {formatoCOP(totalCarrito)}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleCobrarVenta}
                  disabled={cart.length === 0 || isProcessing}
                  className="w-full bg-[#0DE8C0] hover:bg-[#0bcfa8] disabled:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-[#1D2935] font-satoshi-black p-4 rounded-xl text-sm uppercase tracking-wider transition-all duration-300 shadow-xl shadow-emerald-950/50 flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <span>Procesando Venta...</span>
                  ) : (
                    <>
                      <svg className="w-5 h-5 text-[#1D2935]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      <span>Cobrar y Generar Factura</span>
                    </>
                  )}
                </button>
              </div>

            </div>
          </div>

        </div>
      )}

      {/* PESTAÑA 2: HISTORIAL CON OPCIÓN DE REVERSAR / ANULAR VENTA */}
      {activeTab === 'HISTORIAL' && (
        <div className="space-y-4">
          <div className="bg-[#253443] border border-slate-700/60 rounded-2xl p-3 shadow-lg flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="relative w-full md:w-80">
              <svg className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input 
                type="text" 
                className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl pl-10 pr-3 py-2.5 text-xs text-white placeholder-[#A0AEC0] focus:outline-none font-satoshi-regular transition"
                placeholder="Buscar por ID Factura o Cliente..."
                value={searchHistorial}
                onChange={(e) => setSearchHistorial(e.target.value)}
              />
            </div>

            {esVendedor && (
              <span className="text-[11px] font-satoshi-black text-[#0DE8C0] bg-[#1D2935] px-3 py-1.5 rounded-xl border border-slate-700">
                🔒 Mostrando únicamente ventas realizadas por: {userAuth?.nombre}
              </span>
            )}
          </div>

          <div className="bg-[#253443] border border-slate-700/50 rounded-2xl shadow-xl overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#1D2935] text-[11px] font-satoshi-black text-[#A0AEC0] uppercase tracking-wider border-b border-slate-700">
                  <th className="p-4">N° Factura</th>
                  <th className="p-4">Fecha / Hora</th>
                  <th className="p-4">Sede Despacho</th>
                  <th className="p-4">Cliente</th>
                  <th className="p-4">Vendedor</th>
                  <th className="p-4">Método Pago</th>
                  <th className="p-4 text-right">Total</th>
                  <th className="p-4 text-center">Estado</th>
                  <th className="p-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60 text-xs font-satoshi-regular">
                {ventasHistorialFiltradas.map((v, idx) => {
                  const fechaFormatted = v.fecha_cobro || v.fecha 
                    ? new Date(v.fecha_cobro || v.fecha).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
                    : 'N/A';

                  const isAnulada = v.estado === 'ANULADA';

                  return (
                    <tr key={v.id_doc || idx} className="hover:bg-[#1D2935]/80 transition-colors">
                      <td className="p-4 font-mono font-bold text-white">
                        {v.id_factura || 'FACT_SIN_ID'}
                      </td>

                      <td className="p-4 text-slate-300">
                        {fechaFormatted}
                      </td>

                      <td className="p-4 text-slate-200 font-satoshi-black">
                        {v.nombre_bodega || v.id_bodega_despacho || 'Sede Principal'}
                      </td>

                      <td className="p-4 text-slate-300">
                        {v.cliente_nombre || 'Consumidor Final'}
                      </td>

                      <td className="p-4 text-[#0DE8C0] font-satoshi-black">
                        {v.vendedor_nombre || 'Cajero POS'}
                      </td>

                      <td className="p-4 text-slate-300 font-satoshi-black">
                        {v.metodo_pago ? (
                          <span className="bg-[#1D2935] px-2 py-0.5 rounded border border-slate-700 text-slate-200">
                            {v.metodo_pago}
                          </span>
                        ) : (
                          <span className="text-slate-500">Efectivo (N/A)</span>
                        )}
                      </td>

                      <td className="p-4 text-right font-satoshi-black text-[#0DE8C0] text-sm">
                        {formatoCOP(v.total || v.subtotal || 0)}
                      </td>

                      <td className="p-4 text-center">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-satoshi-black ${
                          isAnulada 
                            ? 'bg-red-950/80 text-red-400 border border-red-800/40' 
                            : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/40'
                        }`}>
                          {v.estado || 'PAGADA'}
                        </span>
                      </td>

                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedVentaTicket(v);
                              setShowTicketModal(true);
                            }}
                            className="bg-[#1D2935] hover:bg-[#15202b] text-[#0DE8C0] border border-[#0DE8C0]/40 font-satoshi-black px-3 py-1.5 rounded-lg text-xs transition"
                          >
                            Ver Ticket
                          </button>

                          {!isAnulada && (
                            <button
                              type="button"
                              onClick={() => handleOpenAnular(v)}
                              className="bg-red-950/60 hover:bg-red-900 border border-red-800/40 text-red-400 font-satoshi-black px-2.5 py-1.5 rounded-lg text-xs transition flex items-center gap-1"
                              title="Reversar venta y reponer inventario"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                              <span>Anular</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {ventasHistorialFiltradas.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-12 text-center text-[#A0AEC0] text-xs font-satoshi-regular">
                      No se encontraron facturas registradas a nombre de {userAuth?.nombre}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL DE COMPROBANTE DE VENTA */}
      {showTicketModal && selectedVentaTicket && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#253443] border border-slate-700/80 text-slate-200 rounded-2xl w-full max-w-sm p-6 shadow-2xl font-mono text-xs relative space-y-4 animate-in fade-in slide-in-from-bottom-2">
            
            <button
              onClick={() => setShowTicketModal(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-white transition font-sans text-sm"
            >
              ✕
            </button>

            <div className="text-center border-b border-dashed border-slate-700 pb-3 space-y-1">
              <h2 className="font-bold text-base tracking-widest text-[#0DE8C0] uppercase font-satoshi-black">
                ATOM STOCK POS
              </h2>
              <p className="text-[11px] text-slate-300 font-satoshi-regular">{selectedVentaTicket.nombre_bodega || 'Sede Principal'}</p>
              <p className="text-[10px] text-[#A0AEC0]">N° {selectedVentaTicket.id_factura}</p>
              <p className="text-[10px] text-[#A0AEC0]">
                {new Date(selectedVentaTicket.fecha_cobro || selectedVentaTicket.fecha).toLocaleString()}
              </p>
            </div>

            <div className="border-b border-dashed border-slate-700 pb-2 text-[10px] space-y-0.5 text-slate-300">
              <p>CLIENTE: <span className="font-bold text-white">{selectedVentaTicket.cliente_nombre}</span></p>
              <p>NIT/ID: {selectedVentaTicket.cliente_nit || 'CF_GENERAL'}</p>
              <p>CAJERO: {selectedVentaTicket.vendedor_nombre}</p>
            </div>

            {selectedVentaTicket.estado === 'ANULADA' && (
              <div className="bg-red-950/80 border border-red-800/60 p-2.5 rounded-xl text-[10px] space-y-0.5 text-red-300">
                <p className="font-bold uppercase">⚠️ VENTA ANULADA / REVERSADA</p>
                <p>Motivo: {selectedVentaTicket.motivo_anulacion || 'Sin motivo especificado'}</p>
                <p>Anulado por: {selectedVentaTicket.usuario_anulo_nombre || 'Sistema'}</p>
              </div>
            )}

            <div className="border-b border-dashed border-slate-700 pb-3 space-y-1.5">
              {Array.isArray(selectedVentaTicket.items) && selectedVentaTicket.items.map((it: any, i: number) => (
                <div key={i} className="flex justify-between items-start text-[11px]">
                  <div className="truncate pr-2">
                    <div className="font-bold text-slate-100 truncate">{it.nombre}</div>
                    <div className="text-[9px] text-[#A0AEC0]">{it.cantidad} x {formatoCOP(it.precio)}</div>
                  </div>
                  <span className="font-bold text-[#0DE8C0]">{formatoCOP(it.cantidad * it.precio)}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1 pt-1 text-right">
              <div className="flex justify-between text-xs text-slate-300">
                <span>Método Pago:</span>
                <span className="font-bold text-white">{selectedVentaTicket.metodo_pago || 'EFECTIVO'}</span>
              </div>
              <div className="flex justify-between text-sm font-black pt-2 border-t border-slate-700 text-[#0DE8C0]">
                <span>TOTAL:</span>
                <span>{formatoCOP(selectedVentaTicket.total)}</span>
              </div>
            </div>

            <div className="text-center text-[9px] text-[#A0AEC0] pt-2 border-t border-dashed border-slate-700">
              Comprobante digital procesado por ATOM STOCK.
            </div>

            <div className="flex flex-col gap-2 pt-2 font-sans">
              <button
                type="button"
                onClick={() => window.print()}
                className="w-full bg-[#0DE8C0] hover:bg-[#0bcfa8] text-[#1D2935] font-satoshi-black py-3 rounded-xl text-xs uppercase tracking-wider shadow-md flex items-center justify-center gap-2 transition"
              >
                <svg className="w-4 h-4 text-[#1D2935]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                <span>Imprimir Comprobante PDF</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL JUSTIFICACIÓN DE ANULACIÓN DE VENTA */}
      {showModalAnular && ventaAAnular && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#253443] border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl font-sans space-y-4">
            <div className="flex justify-between items-center border-b border-slate-700/60 pb-3">
              <h3 className="text-lg font-satoshi-black text-white uppercase flex items-center gap-2">
                <span className="text-red-400">⚠️</span> Anular Venta N° {ventaAAnular.id_factura}
              </h3>
              <button onClick={() => setShowModalAnular(false)} className="text-slate-400 hover:text-white transition">
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmarAnulacion} className="space-y-4">
              <div className="bg-[#1D2935] p-3.5 rounded-xl border border-slate-700/80 space-y-1 text-xs text-slate-300">
                <p>Cliente: <span className="font-bold text-white">{ventaAAnular.cliente_nombre}</span></p>
                <p>Monto Total: <span className="font-satoshi-black text-[#0DE8C0]">{formatoCOP(ventaAAnular.total)}</span></p>
                <p className="text-[11px] text-amber-300/90 pt-1">
                  * Al confirmar la anulación, las unidades vendidas se restablecerán automáticamente al stock de la sede.
                </p>
              </div>

              <div>
                <label className="block text-xs font-satoshi-black text-white uppercase tracking-wider mb-2">
                  Justificación / Motivo de la Anulación *
                </label>
                <textarea
                  rows={3}
                  className="w-full bg-[#1D2935] border border-slate-700 focus:border-red-400 rounded-xl p-3 text-xs text-white placeholder-[#A0AEC0] focus:outline-none font-satoshi-regular"
                  placeholder="Ej: Cliente canceló la compra / Error en digitación de cobro / Devolución de producto..."
                  value={motivoAnulacion}
                  onChange={(e) => setMotivoAnulacion(e.target.value)}
                  required
                />
              </div>

              <div className="flex gap-3 pt-2 border-t border-slate-700/60">
                <button
                  type="button"
                  onClick={() => setShowModalAnular(false)}
                  className="flex-1 bg-[#1D2935] text-slate-300 font-satoshi-black py-3 rounded-xl text-xs uppercase hover:bg-slate-800 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isAnulando || !motivoAnulacion.trim()}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-satoshi-black py-3 rounded-xl text-xs uppercase tracking-wider shadow-lg shadow-red-950/50 disabled:opacity-50 transition"
                >
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