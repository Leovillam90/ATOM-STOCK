'use client';

import React, { useState, useEffect, useRef } from 'react';
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
  const [metodoPago, setMetodoPago] = useState<'EFECTIVO' | 'TRANSFERENCIA' | 'TARJETA'>('EFECTIVO');
  const [montoPagaCon, setMontoPagaCon] = useState<number>(0);
  const [ivaIncluido, setIvaIncluido] = useState<boolean>(true);

  // BUSCADOR INTELIGENTE DE CLIENTES
  const [clienteSearch, setClienteSearch] = useState('');
  const [clienteSelObj, setClienteSelObj] = useState<any>({ nit: 'CF_GENERAL', nombre: 'Consumidor Final (CF)' });
  const [showClienteDropdown, setShowClienteDropdown] = useState(false);
  const clienteRef = useRef<HTMLDivElement>(null);

  // DESCUENTOS AUDITABLES
  const [montoDescuento, setMontoDescuento] = useState<number | ''>('');
  const [tipoDescuento, setTipoDescuento] = useState<'FIJO' | 'PORCENTAJE'>('FIJO');
  const [motivoDescuento, setMotivoDescuento] = useState<string>('');

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
    }
  }, []);

  // Escuchar Firestore
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
  }, [userAuth]);

  // SINCRONIZACIÓN AUTOMÁTICA E INMEDIATA DE LA SEDE ACTIVA
  useEffect(() => {
    if (sucursales.length > 0 && !sedeDespacho) {
      const sucsActivas = sucursales.filter(s => s.estado !== 'INACTIVA');
      if (sucsActivas.length > 0) {
        const idSedePreferida = (userAuth?.id_sucursal && sucsActivas.some(s => s.id_sucursal === userAuth.id_sucursal))
          ? userAuth.id_sucursal
          : sucsActivas[0].id_sucursal;
        
        setSedeDespacho(idSedePreferida);
      }
    }
  }, [sucursales, userAuth, sedeDespacho]);

  // Cierre de Popover de Cliente al dar click afuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (clienteRef.current && !clienteRef.current.contains(e.target as Node)) {
        setShowClienteDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // AGREGAR AL CARRITO CON VALIDACIÓN DE STOCK DISPONIBLE
  const addToCart = (prod: any) => {
    const sedeEfectiva = sedeDespacho || (sucursales[0]?.id_sucursal || '');
    const stockDisponible = Number(prod.stock?.[sedeEfectiva] || 0);
    const itemActual = cart.find(item => item.sku === prod.sku);
    const cantidadEnCarrito = itemActual ? itemActual.cantidad : 0;

    if (cantidadEnCarrito + 1 > stockDisponible) {
      return alert(`⚠️ Stock Insuficiente: El producto "${prod.nombre}" solo cuenta con ${stockDisponible} unidades disponibles en esta sede.`);
    }

    setCart(prev => {
      const idx = prev.findIndex(item => item.sku === prod.sku);
      const tarifaIva = prod.iva !== undefined ? Number(prod.iva) : 19;

      if (idx >= 0) {
        const copy = [...prev];
        copy[idx].cantidad += 1;
        return copy;
      } else {
        return [...prev, {
          sku: prod.sku,
          nombre: prod.nombre,
          precio: prod.plocal || prod.precio || 0,
          tarifaIva: tarifaIva,
          cantidad: 1
        }];
      }
    });
  };

  // ACTUALIZAR CANTIDAD CON BOTONES + Y - CON VALIDACIÓN DE STOCK
  const updateQuantity = (sku: string, delta: number) => {
    const sedeEfectiva = sedeDespacho || (sucursales[0]?.id_sucursal || '');
    const prodObj = productos.find(p => p.sku === sku);
    const stockDisponible = Number(prodObj?.stock?.[sedeEfectiva] || 0);

    setCart(prev => {
      return prev.map(item => {
        if (item.sku === sku) {
          const nuevaCant = item.cantidad + delta;

          if (delta > 0 && nuevaCant > stockDisponible) {
            alert(`⚠️ Stock Insuficiente: Solo hay ${stockDisponible} unidades disponibles de este producto.`);
            return item;
          }

          return nuevaCant > 0 ? { ...item, cantidad: nuevaCant } : null;
        }
        return item;
      }).filter(Boolean) as any[];
    });
  };

  // CAMBIO MANUAL DE CANTIDAD CON TECLADO Y VALIDACIÓN DE STOCK
  const handleQuantityManualChange = (sku: string, value: number) => {
    const sedeEfectiva = sedeDespacho || (sucursales[0]?.id_sucursal || '');
    const prodObj = productos.find(p => p.sku === sku);
    const stockDisponible = Number(prodObj?.stock?.[sedeEfectiva] || 0);

    if (value > stockDisponible) {
      alert(`⚠️ Stock Insuficiente: No puedes solicitar ${value} unidades. El stock máximo disponible es de ${stockDisponible} unidades.`);
      value = stockDisponible;
    }

    const valFinal = Math.max(1, value);
    setCart(prev => prev.map(item => item.sku === sku ? { ...item, cantidad: valFinal } : item));
  };

  const removeFromCart = (sku: string) => {
    setCart(prev => prev.filter(item => item.sku !== sku));
  };

  // CÁLCULOS DE MONTO, DESCUENTOS E IVA
  const subtotalBrutoCarrito = cart.reduce((acc, item) => acc + (item.precio * item.cantidad), 0);

  let valorDescuentoEfectivo = 0;
  if (montoDescuento && Number(montoDescuento) > 0) {
    if (tipoDescuento === 'PORCENTAJE') {
      valorDescuentoEfectivo = (subtotalBrutoCarrito * Math.min(Number(montoDescuento), 100)) / 100;
    } else {
      valorDescuentoEfectivo = Math.min(Number(montoDescuento), subtotalBrutoCarrito);
    }
  }

  const subtotalConDescuento = subtotalBrutoCarrito - valorDescuentoEfectivo;

  let baseGravableTotal = 0;
  let ivaMontoTotal = 0;
  let totalCobroPOS = 0;

  if (ivaIncluido) {
    totalCobroPOS = subtotalConDescuento;
    cart.forEach(item => {
      const tarifa = item.tarifaIva || 19;
      const fraccionItem = subtotalBrutoCarrito > 0 ? (item.precio * item.cantidad) / subtotalBrutoCarrito : 0;
      const totalItemConDesc = subtotalConDescuento * fraccionItem;
      const baseItem = totalItemConDesc / (1 + (tarifa / 100));
      const ivaItem = totalItemConDesc - baseItem;

      baseGravableTotal += baseItem;
      ivaMontoTotal += ivaItem;
    });
  } else {
    baseGravableTotal = subtotalConDescuento;
    cart.forEach(item => {
      const tarifa = item.tarifaIva || 19;
      const fraccionItem = subtotalBrutoCarrito > 0 ? (item.precio * item.cantidad) / subtotalBrutoCarrito : 0;
      const totalItemConDesc = subtotalConDescuento * fraccionItem;
      ivaMontoTotal += (totalItemConDesc * tarifa) / 100;
    });
    totalCobroPOS = baseGravableTotal + ivaMontoTotal;
  }

  const cambioDevuelto = metodoPago === 'EFECTIVO' && montoPagaCon > totalCobroPOS ? montoPagaCon - totalCobroPOS : 0;

  // FILTRADO DINÁMICO DE CLIENTES POR BUSCADOR
  const clientesFiltradosPOS = clientes.filter(c => 
    String(c.nombre || '').toLowerCase().includes(clienteSearch.toLowerCase()) ||
    String(c.nit || c.id_cliente || '').toLowerCase().includes(clienteSearch.toLowerCase())
  );

  // PROCESAR COBRO POS CON AUDITORÍA PREVIA DE INVENTARIOS
  const handleCobrarVenta = async () => {
    const sedeEfectiva = sedeDespacho || (sucursales[0]?.id_sucursal || '');
    if (cart.length === 0) return alert('El carrito está vacío. Selecciona al menos un producto.');
    if (!sedeEfectiva) return alert('Por favor selecciona la sede de despacho.');

    // VERIFICACIÓN INTEGRAL DE STOCK ANTES DEL REGISTRO FINAL
    for (const item of cart) {
      const prodObj = productos.find(p => p.sku === item.sku);
      const stockDisponible = Number(prodObj?.stock?.[sedeEfectiva] || 0);

      if (item.cantidad > stockDisponible) {
        return alert(`🚫 Venta Bloqueada: El producto "${item.nombre}" supera el inventario real (${stockDisponible} disponibles). Ajusta la cantidad antes de continuar.`);
      }
    }

    if (montoDescuento && Number(montoDescuento) > 0 && !motivoDescuento.trim()) {
      return alert('Ingresa la justificación o motivo del descuento otorgado.');
    }
    if (metodoPago === 'EFECTIVO' && montoPagaCon > 0 && montoPagaCon < totalCobroPOS) {
      return alert('El monto pagado en efectivo es menor al total a cobrar.');
    }

    setIsProcessing(true);
    try {
      const idFactura = `FACT_${Date.now().toString().slice(-6)}`;
      const sucObj = sucursales.find(s => s.id_sucursal === sedeEfectiva);

      const ventaData = {
        id_cuenta: userAuth.id_cuenta,
        id_factura: idFactura,
        fecha: new Date().toISOString(),
        fecha_cobro: new Date().toISOString(),
        id_bodega_despacho: sedeEfectiva,
        nombre_bodega: sucObj ? (sucObj.nombre || sucObj.NOMBRE) : 'Sede Principal',
        vendedor_nombre: userAuth?.nombre || 'Cajero POS',
        vendedor_id: userAuth?.id_usuario || '',
        cliente_nombre: clienteSelObj.nombre,
        cliente_nit: clienteSelObj.nit,
        cliente_correo: clienteSelObj.correo || 'cliente@general.com',
        items: cart,
        metodo_pago: metodoPago,
        
        subtotal_bruto: subtotalBrutoCarrito,
        descuento_monto: valorDescuentoEfectivo,
        descuento_tipo: tipoDescuento,
        descuento_valor_input: Number(montoDescuento) || 0,
        descuento_motivo: motivoDescuento.trim() || 'Sin descuento',

        subtotal: baseGravableTotal,
        iva_monto: ivaMontoTotal,
        iva_incluido_config: ivaIncluido,
        monto_paga_con: montoPagaCon,
        cambio_devuelto: cambioDevuelto,
        total: totalCobroPOS,
        estado: 'PAGADA'
      };

      await setDoc(doc(db, 'ventas', idFactura), ventaData, { merge: true });

      // Descontar Stock
      for (const item of cart) {
        const prodRef = doc(db, 'productos', item.sku);
        const prodObj = productos.find(p => p.sku === item.sku);
        if (prodObj) {
          const currentStockMap = prodObj.stock || {};
          const currentVal = Number(currentStockMap[sedeEfectiva] || 0);
          const newVal = Math.max(0, currentVal - item.cantidad);
          
          await setDoc(prodRef, {
            stock: {
              ...currentStockMap,
              [sedeEfectiva]: newVal
            }
          }, { merge: true });
        }
      }

      setCart([]);
      setMontoPagaCon(0);
      setMontoDescuento('');
      setMotivoDescuento('');
      setSelectedVentaTicket(ventaData);
      setShowTicketModal(true);
    } catch (err: any) {
      console.error(err);
      alert('Error al registrar cobro: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // Modal Anular
  const handleOpenAnular = (v: any) => {
    setVentaAAnular(v);
    setMotivoAnulacion('');
    setShowModalAnular(true);
  };

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

      const updateData = {
        estado: 'ANULADA',
        motivo_anulacion: motivoAnulacion.trim(),
        fecha_anulacion: new Date().toISOString(),
        usuario_anulo_nombre: userAuth?.nombre || 'Usuario ATOM',
        usuario_anulo_id: userAuth?.id_usuario || ''
      };

      await setDoc(doc(db, 'ventas', docId), updateData, { merge: true });

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

      alert(`¡Venta N° ${ventaAAnular.id_factura} ANULADA y stock restablecido!`);
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

  const ventasHistorialFiltradas = ventas.filter(v => {
    if (esVendedor) {
      const coincideId = userAuth?.id_usuario && v.vendedor_id === userAuth.id_usuario;
      const coincideNombre = v.vendedor_nombre === userAuth?.nombre;
      if (!coincideId && !coincideNombre) return false;
    }

    const q = searchHistorial.toLowerCase().trim();
    return String(v.id_factura || '').toLowerCase().includes(q) ||
           String(v.cliente_nombre || '').toLowerCase().includes(q) ||
           String(v.nombre_bodega || '').toLowerCase().includes(q);
  });

  // DETERMINAR LA SEDE ACTIVA GARANTIZADA (EVITA EL VALOR EN BLANCO INICIAL)
  const sucsActivas = sucursales.filter(s => s.estado !== 'INACTIVA');
  const sedeGarantizada = sedeDespacho || (sucsActivas.length > 0 ? sucsActivas[0].id_sucursal : '');

  // FILTRADO DINÁMICO DE PRODUCTOS SEGÚN LA SEDE ACTIVA (> 0 UNIDADES)
  const productosPOS = productos.filter(p => {
    const q = searchProd.toLowerCase().trim();
    const matchSearch = String(p.nombre || '').toLowerCase().includes(q) || String(p.sku || '').toLowerCase().includes(q);
    const stockEnSedeActiva = Number(p.stock?.[sedeGarantizada] || 0);

    return matchSearch && stockEnSedeActiva > 0;
  });

  const sedeActivaObj = sucursales.find(s => s.id_sucursal === sedeGarantizada);

  return (
    <div className="min-h-screen bg-[#1D2935] text-slate-100 p-4 md:p-8 font-sans relative pb-20">
      
      {/* CABECERA SUPERIOR */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 border-b border-slate-700/60 pb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight font-satoshi-black">
            Registro de Ventas
          </h1>
          <p className="text-xs text-[#A0AEC0] mt-0.5 font-satoshi-regular">
            {esVendedor 
              ? `Cajero Activo: ${userAuth?.nombre || 'Mi Caja'} | Sede: ${sedeActivaObj ? (sedeActivaObj.nombre || sedeActivaObj.NOMBRE) : 'Mi Sede'}`
              : 'Cobro rápido en mostrador, descuentos auditables y facturación en tiempo real.'}
          </p>
        </div>

        <div className="bg-[#253443] p-1 rounded-xl flex items-center gap-1 border border-slate-700/60 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('POS')}
            className={`px-4 py-2 rounded-lg text-xs font-satoshi-black transition flex items-center gap-2 ${
              activeTab === 'POS' ? 'bg-[#0DE8C0] text-[#1D2935] shadow-md' : 'text-[#A0AEC0] hover:text-white'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 00-2 2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span>Caja Registrar (POS)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('HISTORIAL')}
            className={`px-4 py-2 rounded-lg text-xs font-satoshi-black transition flex items-center gap-2 ${
              activeTab === 'HISTORIAL' ? 'bg-[#0DE8C0] text-[#1D2935] shadow-md' : 'text-[#A0AEC0] hover:text-white'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 01-2-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Mis Ventas Realizadas ({ventasHistorialFiltradas.length})</span>
          </button>
        </div>
      </div>

      {/* PESTAÑA 1: POS */}
      {activeTab === 'POS' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* SECCIÓN IZQUIERDA: CATÁLOGO */}
          <div className="lg:col-span-7 space-y-4">
            
            <div className="bg-[#253443] border border-slate-700/60 rounded-2xl p-3 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative flex-1 w-full">
                <svg className="w-5 h-5 text-[#0DE8C0] absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input 
                  type="text" 
                  className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl pl-11 pr-4 py-2.5 text-xs text-white placeholder-[#A0AEC0] focus:outline-none transition"
                  placeholder="Escribe el nombre o escanea el código SKU..."
                  value={searchProd}
                  onChange={(e) => setSearchQueryProd(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="flex items-center gap-2 bg-[#1D2935] px-3.5 py-2 rounded-xl border border-slate-700/80 shrink-0 select-none">
                <input
                  type="checkbox"
                  id="ivaCheck"
                  checked={ivaIncluido}
                  onChange={(e) => setIvaIncluido(e.target.checked)}
                  className="rounded bg-[#253443] border-slate-700 text-[#0DE8C0] focus:ring-0 w-4 h-4 cursor-pointer"
                />
                <label htmlFor="ivaCheck" className="text-xs font-satoshi-black text-slate-200 cursor-pointer">
                  IVA Incluido en Precio
                </label>
              </div>
            </div>

            {/* GRID DE PRODUCTOS FILTRADOS POR LA SEDE SELECCIONADA */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
              {productosPOS.map((prod, idx) => {
                const stockSede = Number(prod.stock?.[sedeGarantizada] || 0);
                const tarifaIvaProd = prod.iva !== undefined ? Number(prod.iva) : 19;

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
                      <div>
                        <span className="font-satoshi-black text-sm text-[#0DE8C0] block">
                          {formatoCOP(prod.plocal || prod.precio || 0)}
                        </span>
                        <span className="text-[9px] text-[#A0AEC0] block font-mono">
                          IVA: {tarifaIvaProd}%
                        </span>
                      </div>
                      <span className="text-[9px] font-satoshi-black px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                        Stk: {stockSede}
                      </span>
                    </div>
                  </div>
                );
              })}

              {productosPOS.length === 0 && (
                <div className="col-span-full text-center py-12 bg-[#253443] rounded-2xl border border-slate-700/60 p-6 text-[#A0AEC0] text-xs font-satoshi-regular">
                  No hay productos disponibles con stock en la sede seleccionada.
                </div>
              )}
            </div>
          </div>

          {/* SECCIÓN DERECHA: COBRO Y DESCUENTOS AUDITABLES */}
          <div className="lg:col-span-5 space-y-4">
            
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
                className="bg-[#1D2935] border border-slate-700 text-xs font-satoshi-black text-[#0DE8C0] rounded-xl px-2.5 py-1.5 focus:outline-none cursor-pointer shrink-0 disabled:opacity-60"
                value={sedeGarantizada}
                onChange={(e) => setSedeDespacho(e.target.value)}
                disabled={esVendedor}
              >
                {sucsActivas.map((s, idx) => (
                  <option key={s.id_sucursal || idx} value={s.id_sucursal} className="bg-[#1D2935] text-white">
                    {s.nombre || s.NOMBRE}
                  </option>
                ))}
              </select>
            </div>

            {/* PANEL DE CARRITO Y EDICIÓN MANUAL */}
            <div className="bg-[#253443] border border-slate-700/60 rounded-2xl p-5 shadow-xl flex flex-col justify-between min-h-[480px]">
              <div className="space-y-3">
                <div className="flex justify-between items-center border-b border-slate-700/60 pb-2">
                  <h3 className="text-xs font-satoshi-black text-white uppercase tracking-wider">
                    Carrito de Compra ({cart.reduce((a, c) => a + c.cantidad, 0)})
                  </h3>
                  {cart.length > 0 && (
                    <button type="button" onClick={() => setCart([])} className="text-[11px] text-red-400 hover:underline">
                      Vaciar
                    </button>
                  )}
                </div>

                {/* CANTIDAD MANUAL + BOTONES + Y - CON CLASES CSS PARA OCULTAR FLECHAS NATIVAS */}
                <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
                  {cart.map((item) => (
                    <div key={item.sku} className="bg-[#1D2935] rounded-xl p-2.5 border border-slate-700/60 flex items-center justify-between gap-2">
                      <div className="truncate flex-1">
                        <div className="text-xs font-satoshi-black text-white truncate">{item.nombre}</div>
                        <div className="text-[10px] text-[#A0AEC0]">
                          {formatoCOP(item.precio)} c/u (IVA {item.tarifaIva}%)
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button type="button" onClick={() => updateQuantity(item.sku, -1)} className="w-6 h-6 bg-[#253443] text-white rounded-lg font-satoshi-black text-xs hover:bg-slate-700">-</button>
                        
                        {/* INPUT NUMÉRICO SIN FLECHAS NATIVAS DE NAVEGADOR */}
                        <input
                          type="number"
                          min="1"
                          value={item.cantidad}
                          onChange={(e) => handleQuantityManualChange(item.sku, Number(e.target.value))}
                          className="w-12 bg-[#253443] border border-slate-700 rounded-lg text-center font-satoshi-black text-xs text-[#0DE8C0] py-0.5 focus:outline-none focus:border-[#0DE8C0] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />

                        <button type="button" onClick={() => updateQuantity(item.sku, 1)} className="w-6 h-6 bg-[#253443] text-white rounded-lg font-satoshi-black text-xs hover:bg-slate-700">+</button>
                        <button type="button" onClick={() => removeFromCart(item.sku)} className="ml-1 text-slate-500 hover:text-red-400 text-xs">✕</button>
                      </div>
                    </div>
                  ))}
                  {cart.length === 0 && (
                    <div className="text-center py-8 text-[#A0AEC0] text-xs">Haz clic en los productos para agregarlos al cobro.</div>
                  )}
                </div>
              </div>

              {/* MÓDULO DE DESCUENTOS Y BUSCADOR INTELIGENTE DE CLIENTES */}
              <div className="space-y-3 pt-3 border-t border-slate-700/60">
                
                {/* APLICACIÓN DE DESCUENTO */}
                <div className="bg-[#1D2935] p-3 rounded-xl border border-slate-700 space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[11px] font-satoshi-black text-[#0DE8C0] uppercase">
                      Descuento Auditable
                    </label>
                    <div className="flex gap-1 text-[10px] font-satoshi-black">
                      <button
                        type="button"
                        onClick={() => setTipoDescuento('FIJO')}
                        className={`px-2 py-0.5 rounded ${tipoDescuento === 'FIJO' ? 'bg-[#0DE8C0] text-[#1D2935]' : 'bg-[#253443] text-slate-400'}`}
                      >
                        Fijo ($)
                      </button>
                      <button
                        type="button"
                        onClick={() => setTipoDescuento('PORCENTAJE')}
                        className={`px-2 py-0.5 rounded ${tipoDescuento === 'PORCENTAJE' ? 'bg-[#0DE8C0] text-[#1D2935]' : 'bg-[#253443] text-slate-400'}`}
                      >
                        Porcentaje (%)
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      min="0"
                      placeholder={tipoDescuento === 'PORCENTAJE' ? 'Ej: 10 %' : 'Ej: 5000 $'}
                      className="bg-[#253443] border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      value={montoDescuento}
                      onChange={(e) => setMontoDescuento(e.target.value ? Number(e.target.value) : '')}
                    />
                    <input
                      type="text"
                      placeholder="Motivo (Obligatorio)..."
                      className="bg-[#253443] border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none"
                      value={motivoDescuento}
                      onChange={(e) => setMotivoDescuento(e.target.value)}
                    />
                  </div>
                </div>

                {/* BUSCADOR DE CLIENTES CON DOWPDOWN INTELIGENTE */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="relative" ref={clienteRef}>
                    <label className="block text-[10px] font-satoshi-black text-[#A0AEC0] uppercase mb-1">Buscar Cliente</label>
                    <input
                      type="text"
                      placeholder="Nombre o Cédula..."
                      className="w-full bg-[#1D2935] border border-slate-700 text-xs text-white rounded-xl p-2 focus:outline-none focus:border-[#0DE8C0] font-satoshi-black"
                      value={clienteSearch || clienteSelObj.nombre}
                      onFocus={() => setShowClienteDropdown(true)}
                      onChange={(e) => {
                        setClienteSearch(e.target.value);
                        setShowClienteDropdown(true);
                      }}
                    />

                    {/* POPUP DE SELECCIÓN DE CLIENTE */}
                    {showClienteDropdown && (
                      <div className="absolute left-0 right-0 bottom-full mb-1 bg-[#1D2935] border border-slate-700 rounded-xl shadow-2xl max-h-48 overflow-y-auto z-50 divide-y divide-slate-800 text-xs">
                        <div
                          onClick={() => {
                            setClienteSelObj({ nit: 'CF_GENERAL', nombre: 'Consumidor Final (CF)' });
                            setClienteSearch('');
                            setShowClienteDropdown(false);
                          }}
                          className="p-2.5 hover:bg-[#253443] cursor-pointer text-[#0DE8C0] font-satoshi-black"
                        >
                          Consumidor Final (CF)
                        </div>

                        {clientesFiltradosPOS.map((cli, idx) => (
                          <div
                            key={cli.id_cliente || idx}
                            onClick={() => {
                              setClienteSelObj(cli);
                              setClienteSearch('');
                              setShowClienteDropdown(false);
                            }}
                            className="p-2.5 hover:bg-[#253443] cursor-pointer text-slate-200"
                          >
                            <div className="font-satoshi-black text-white">{cli.nombre}</div>
                            <div className="text-[10px] text-slate-400 font-mono">NIT/ID: {cli.nit || cli.id_cliente}</div>
                          </div>
                        ))}

                        {clientesFiltradosPOS.length === 0 && (
                          <div className="p-3 text-slate-500 text-center text-[11px]">No se encontraron clientes.</div>
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-[10px] font-satoshi-black text-[#A0AEC0] uppercase mb-1">Método de Pago</label>
                    <select
                      className="w-full bg-[#1D2935] border border-slate-700 text-xs text-white font-satoshi-black rounded-xl p-2 focus:outline-none"
                      value={metodoPago}
                      onChange={(e: any) => setMetodoPago(e.target.value)}
                    >
                      <option value="EFECTIVO">Efectivo</option>
                      <option value="TRANSFERENCIA">Transferencia / Nequi</option>
                      <option value="TARJETA">Tarjeta Débito/Crédito</option>
                    </select>
                  </div>
                </div>

                {/* LIQUIDACIÓN FINAL */}
                <div className="bg-[#1D2935] p-3 rounded-xl border border-slate-700/80 space-y-1 text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>Subtotal Bruto:</span>
                    <span>{formatoCOP(subtotalBrutoCarrito)}</span>
                  </div>

                  {valorDescuentoEfectivo > 0 && (
                    <div className="flex justify-between text-amber-400 font-satoshi-black">
                      <span>Descuento Aplicado:</span>
                      <span>-{formatoCOP(valorDescuentoEfectivo)}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-slate-400">
                    <span>Base Gravable:</span>
                    <span>{formatoCOP(baseGravableTotal)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>IVA Calculado:</span>
                    <span>{formatoCOP(ivaMontoTotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-satoshi-black text-white pt-1 border-t border-slate-700/60">
                    <span>TOTAL A COBRAR:</span>
                    <span className="text-[#0DE8C0]">{formatoCOP(totalCobroPOS)}</span>
                  </div>
                </div>

                {metodoPago === 'EFECTIVO' && (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="block text-[10px] font-satoshi-black text-[#A0AEC0] uppercase mb-1">Paga Con ($)</label>
                      <input
                        type="number"
                        className="w-full bg-[#1D2935] border border-slate-700 rounded-xl p-2 text-white focus:outline-none font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        value={montoPagaCon}
                        onChange={(e) => setMontoPagaCon(Number(e.target.value))}
                      />
                    </div>
                    {cambioDevuelto > 0 && (
                      <div className="bg-[#1D2935] p-2 rounded-xl border border-slate-700 flex flex-col justify-center">
                        <span className="text-[9px] text-slate-400 font-satoshi-black uppercase">Cambio Devuelto:</span>
                        <span className="text-amber-400 font-satoshi-black text-xs">{formatoCOP(cambioDevuelto)}</span>
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleCobrarVenta}
                  disabled={cart.length === 0 || isProcessing || (Number(montoDescuento) > 0 && !motivoDescuento.trim())}
                  className="w-full bg-[#0DE8C0] hover:bg-[#0bcfa8] disabled:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-[#1D2935] font-satoshi-black p-3.5 rounded-xl text-xs uppercase tracking-wider transition-all duration-300 shadow-xl flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <span>Procesando Venta...</span>
                  ) : (
                    <>
                      <svg className="w-5 h-5 text-[#1D2935]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      <span>Cobrar y Generar Ticket</span>
                    </>
                  )}
                </button>
              </div>

            </div>
          </div>

        </div>
      )}

      {/* PESTAÑA 2: HISTORIAL */}
      {activeTab === 'HISTORIAL' && (
        <div className="space-y-4">
          <div className="bg-[#253443] border border-slate-700/60 rounded-2xl p-3 shadow-lg flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="relative w-full md:w-80">
              <svg className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input 
                type="text" 
                className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl pl-10 pr-3 py-2.5 text-xs text-white placeholder-[#A0AEC0] focus:outline-none transition"
                placeholder="Buscar por ID Factura o Cliente..."
                value={searchHistorial}
                onChange={(e) => setSearchHistorial(e.target.value)}
              />
            </div>
          </div>

          <div className="bg-[#253443] border border-slate-700/50 rounded-2xl shadow-xl overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#1D2935] text-[11px] font-satoshi-black text-[#A0AEC0] uppercase tracking-wider border-b border-slate-700">
                  <th className="p-4">N° Factura</th>
                  <th className="p-4">Fecha / Hora</th>
                  <th className="p-4">Cliente</th>
                  <th className="p-4">Vendedor</th>
                  <th className="p-4">Descuento Auditoría</th>
                  <th className="p-4 text-right">Total</th>
                  <th className="p-4 text-center">Estado</th>
                  <th className="p-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60 text-xs font-satoshi-regular">
                {ventasHistorialFiltradas.map((v, idx) => {
                  const isAnulada = v.estado === 'ANULADA';
                  const tieneDescuento = v.descuento_monto && v.descuento_monto > 0;

                  return (
                    <tr key={v.id_doc || idx} className="hover:bg-[#1D2935]/80 transition-colors">
                      <td className="p-4 font-mono font-bold text-white">{v.id_factura}</td>
                      <td className="p-4 text-slate-300">{new Date(v.fecha_cobro || v.fecha).toLocaleString()}</td>
                      <td className="p-4 text-slate-300">{v.cliente_nombre}</td>
                      <td className="p-4 text-[#0DE8C0] font-satoshi-black">{v.vendedor_nombre}</td>
                      
                      <td className="p-4">
                        {tieneDescuento ? (
                          <div>
                            <span className="text-amber-400 font-satoshi-black">
                              -{formatoCOP(v.descuento_monto)}
                            </span>
                            <span className="text-[10px] text-slate-400 block italic truncate max-w-xs">
                              &quot;{v.descuento_motivo}&quot;
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-500 font-mono">Sin Desc.</span>
                        )}
                      </td>

                      <td className="p-4 text-right font-satoshi-black text-[#0DE8C0] text-sm">{formatoCOP(v.total)}</td>
                      <td className="p-4 text-center">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-satoshi-black ${
                          isAnulada ? 'bg-red-950/80 text-red-400' : 'bg-emerald-950/80 text-emerald-300'
                        }`}>
                          {v.estado || 'PAGADA'}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => { setSelectedVentaTicket(v); setShowTicketModal(true); }}
                            className="bg-[#1D2935] text-[#0DE8C0] border border-[#0DE8C0]/40 font-satoshi-black px-3 py-1.5 rounded-lg text-xs"
                          >
                            Ver Ticket
                          </button>
                          {!isAnulada && (
                            <button
                              type="button"
                              onClick={() => handleOpenAnular(v)}
                              className="bg-red-950/60 text-red-400 border border-red-800/40 font-satoshi-black px-2.5 py-1.5 rounded-lg text-xs"
                            >
                              Anular
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL TICKET */}
      {showTicketModal && selectedVentaTicket && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#253443] border border-slate-700/80 text-slate-200 rounded-2xl w-full max-w-sm p-6 shadow-2xl font-mono text-xs relative space-y-4">
            
            <button onClick={() => setShowTicketModal(false)} className="absolute right-4 top-4 text-slate-400 hover:text-white">✕</button>

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
              {selectedVentaTicket.subtotal_bruto > 0 && (
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Subtotal Bruto:</span>
                  <span>{formatoCOP(selectedVentaTicket.subtotal_bruto)}</span>
                </div>
              )}

              {selectedVentaTicket.descuento_monto > 0 && (
                <div className="flex justify-between text-[11px] text-amber-400 font-bold">
                  <span>Descuento ({selectedVentaTicket.descuento_motivo}):</span>
                  <span>-{formatoCOP(selectedVentaTicket.descuento_monto)}</span>
                </div>
              )}

              <div className="flex justify-between text-sm font-black pt-2 border-t border-slate-700 text-[#0DE8C0]">
                <span>TOTAL A PAGAR:</span>
                <span>{formatoCOP(selectedVentaTicket.total)}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => window.print()}
              className="w-full bg-[#0DE8C0] text-[#1D2935] font-satoshi-black py-3 rounded-xl text-xs uppercase shadow flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4 text-[#1D2935]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              <span>Imprimir Comprobante PDF</span>
            </button>

          </div>
        </div>
      )}

      {/* MODAL ANULACIÓN */}
      {showModalAnular && ventaAAnular && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#253443] border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl font-sans space-y-4">
            <div className="flex justify-between items-center border-b border-slate-700/60 pb-3">
              <h3 className="text-lg font-satoshi-black text-white uppercase">Anular Venta N° {ventaAAnular.id_factura}</h3>
              <button onClick={() => setShowModalAnular(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleConfirmarAnulacion} className="space-y-4">
              <div>
                <label className="block text-xs font-satoshi-black text-white uppercase mb-2">Motivo *</label>
                <textarea
                  rows={3}
                  className="w-full bg-[#1D2935] border border-slate-700 rounded-xl p-3 text-xs text-white"
                  placeholder="Justificación de anulación..."
                  value={motivoAnulacion}
                  onChange={(e) => setMotivoAnulacion(e.target.value)}
                  required
                />
              </div>

              <div className="flex gap-3">
                <button type="button" onClick={() => setShowModalAnular(false)} className="flex-1 bg-[#1D2935] text-slate-300 font-satoshi-black py-3 rounded-xl text-xs uppercase">Cancelar</button>
                <button type="submit" disabled={isAnulando} className="flex-1 bg-red-600 text-white font-satoshi-black py-3 rounded-xl text-xs uppercase">
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
