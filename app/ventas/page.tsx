'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { collection, query, where, onSnapshot, doc, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import '@/app/globals.css';

export default function VentasPage() {
  const [userAuth, setUserAuth] = useState<any>(null);
  const [ventas, setVentas] = useState<any[]>([]);
  const [productos, setProductos] = useState<any[]>([]);
  const [sucursales, setSucursales] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);

  // Pestañas Principales: Nueva Venta POS / Historial
  const [activeTab, setActiveTab] = useState<'POS' | 'HISTORIAL'>('POS');

  // CONTROL DE VISTA DE PRODUCTOS: TARJETAS O TABLA
  const [viewModeProd, setViewModeProd] = useState<'TARJETAS' | 'TABLA'>('TARJETAS');

  // Estado POS (Terminal)
  const [sedeDespacho, setSedeDespacho] = useState<string>('');
  const [searchProd, setSearchQueryProd] = useState('');
  const [cart, setCart] = useState<any[]>([]);
  const [metodoPago, setMetodoPago] = useState<'EFECTIVO' | 'TRANSFERENCIA' | 'TARJETA'>('EFECTIVO');
  const [montoPagaCon, setMontoPagaCon] = useState<number>(0);
  const [ivaIncluido, setIvaIncluido] = useState<boolean>(true);

  // BUSCADOR INTELIGENTE DE CLIENTES
  const [clienteSearch, setClienteSearch] = useState('');
  const [clienteSelObj, setClienteSelObj] = useState<any>(null);
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
    }, (error) => console.error("Error ventas:", error));

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

  // SINCRONIZACIÓN AUTOMÁTICA DE LA SEDE ACTIVA
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
      return alert(`Stock Insuficiente: El producto "${prod.nombre}" solo cuenta con ${stockDisponible} unidades disponibles en esta sede.`);
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

  // ACTUALIZAR CANTIDAD CON BOTONES + Y -
  const updateQuantity = (sku: string, delta: number) => {
    const sedeEfectiva = sedeDespacho || (sucursales[0]?.id_sucursal || '');
    const prodObj = productos.find(p => p.sku === sku);
    const stockDisponible = Number(prodObj?.stock?.[sedeEfectiva] || 0);

    setCart(prev => {
      return prev.map(item => {
        if (item.sku === sku) {
          const nuevaCant = item.cantidad + delta;

          if (delta > 0 && nuevaCant > stockDisponible) {
            alert(`Stock Insuficiente: Solo hay ${stockDisponible} unidades disponibles de este producto.`);
            return item;
          }

          return nuevaCant > 0 ? { ...item, cantidad: nuevaCant } : null;
        }
        return item;
      }).filter(Boolean) as any[];
    });
  };

  // CAMBIO MANUAL DE CANTIDAD CON TECLADO
  const handleQuantityManualChange = (sku: string, value: number) => {
    const sedeEfectiva = sedeDespacho || (sucursales[0]?.id_sucursal || '');
    const prodObj = productos.find(p => p.sku === sku);
    const stockDisponible = Number(prodObj?.stock?.[sedeEfectiva] || 0);

    if (value > stockDisponible) {
      alert(`Stock Insuficiente: No puedes solicitar ${value} unidades. El stock máximo disponible es de ${stockDisponible} unidades.`);
      value = stockDisponible;
    }

    const valFinal = Math.max(1, value);
    setCart(prev => prev.map(item => item.sku === sku ? { ...item, cantidad: valFinal } : item));
  };

  const removeFromCart = (sku: string) => {
    setCart(prev => prev.filter(item => item.sku !== sku));
  };

  // =========================================================================
  // 🧠 CÁLCULOS OPTIMIZADOS CON USEMEMO
  // =========================================================================
  const { 
    subtotalBrutoCarrito, 
    valorDescuentoEfectivo, 
    subtotalConDescuento, 
    baseGravableTotal, 
    ivaMontoTotal, 
    totalCobroPOS, 
    cambioDevuelto 
  } = useMemo(() => {
    const subtotalBruto = cart.reduce((acc, item) => acc + (item.precio * item.cantidad), 0);

    let valDesc = 0;
    if (montoDescuento && Number(montoDescuento) > 0) {
      if (tipoDescuento === 'PORCENTAJE') {
        valDesc = (subtotalBruto * Math.min(Number(montoDescuento), 100)) / 100;
      } else {
        valDesc = Math.min(Number(montoDescuento), subtotalBruto);
      }
    }

    const subConDesc = subtotalBruto - valDesc;

    let baseGrav = 0;
    let ivaMonto = 0;
    let totalPOS = 0;

    if (ivaIncluido) {
      totalPOS = subConDesc;
      cart.forEach(item => {
        const tarifa = item.tarifaIva || 19;
        const fraccionItem = subtotalBruto > 0 ? (item.precio * item.cantidad) / subtotalBruto : 0;
        const totalItemConDesc = subConDesc * fraccionItem;
        const baseItem = totalItemConDesc / (1 + (tarifa / 100));
        const ivaItem = totalItemConDesc - baseItem;

        baseGrav += baseItem;
        ivaMonto += ivaItem;
      });
    } else {
      baseGrav = subConDesc;
      cart.forEach(item => {
        const tarifa = item.tarifaIva || 19;
        const fraccionItem = subtotalBruto > 0 ? (item.precio * item.cantidad) / subtotalBruto : 0;
        const totalItemConDesc = subConDesc * fraccionItem;
        ivaMonto += (totalItemConDesc * tarifa) / 100;
      });
      totalPOS = baseGrav + ivaMonto;
    }

    const cambio = metodoPago === 'EFECTIVO' && montoPagaCon > totalPOS ? montoPagaCon - totalPOS : 0;

    return {
      subtotalBrutoCarrito: subtotalBruto,
      valorDescuentoEfectivo: valDesc,
      subtotalConDescuento: subConDesc,
      baseGravableTotal: baseGrav,
      ivaMontoTotal: ivaMonto,
      totalCobroPOS: totalPOS,
      cambioDevuelto: cambio
    };
  }, [cart, montoDescuento, tipoDescuento, ivaIncluido, metodoPago, montoPagaCon]);

  // FILTRADO DINÁMICO DE CLIENTES
  const clientesFiltradosPOS = clientes.filter(c => 
    String(c.nombre || '').toLowerCase().includes(clienteSearch.toLowerCase()) ||
    String(c.nit || c.id_cliente || '').toLowerCase().includes(clienteSearch.toLowerCase())
  );

  // =========================================================================
  // 🛡️ PROCESAR COBRO POS
  // =========================================================================
  const handleCobrarVenta = async () => {
    const sedeEfectiva = sedeDespacho || (sucursales[0]?.id_sucursal || '');
    if (cart.length === 0) return alert('El carrito está vacío. Selecciona al menos un producto.');
    if (!sedeEfectiva) return alert('Por favor selecciona la sede de despacho.');
    
    if (!clienteSelObj) {
      return alert('Por favor selecciona un cliente (o elige Consumidor Final) para continuar con la venta.');
    }

    for (const item of cart) {
      const prodObj = productos.find(p => p.sku === item.sku);
      const stockDisponible = Number(prodObj?.stock?.[sedeEfectiva] || 0);

      if (item.cantidad > stockDisponible) {
        return alert(`Venta Bloqueada: El producto "${item.nombre}" supera el inventario real (${stockDisponible} disponibles). Ajusta la cantidad antes de continuar.`);
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
        cliente_nit: clienteSelObj.nit || 'CF_GENERAL',
        cliente_correo: clienteSelObj.email || clienteSelObj.correo || 'cliente@general.com',
        cliente_telefono: clienteSelObj.telefono || 'N/A',
        cliente_direccion: clienteSelObj.direccion || 'N/A',
        cliente_ciudad: clienteSelObj.ciudad || 'Cali',
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

      const batch = writeBatch(db);
      
      const ventaRef = doc(db, 'ventas', idFactura);
      batch.set(ventaRef, ventaData, { merge: true });

      for (const item of cart) {
        const prodRef = doc(db, 'productos', item.sku);
        const prodObj = productos.find(p => p.sku === item.sku);
        if (prodObj) {
          const currentStockMap = prodObj.stock || {};
          const currentVal = Number(currentStockMap[sedeEfectiva] || 0);
          const newVal = Math.max(0, currentVal - item.cantidad);
          
          batch.set(prodRef, {
            stock: {
              ...currentStockMap,
              [sedeEfectiva]: newVal
            }
          }, { merge: true });
        }
      }

      await batch.commit();

      setCart([]);
      setMontoPagaCon(0);
      setMontoDescuento('');
      setMotivoDescuento('');
      setClienteSelObj(null);
      setClienteSearch('');
      setSelectedVentaTicket(ventaData);
      setShowTicketModal(true);
    } catch (err: any) {
      console.error(err);
      alert('Error al registrar cobro: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // ENVÍO DEL COMPROBANTE POR WHATSAPP (TEXTO PLANO SIN EMOJIS)
  const handleEnviarWhatsAppTicket = (ticket: any) => {
    if (!ticket) return;

    const rawTel = ticket.cliente_telefono ? String(ticket.cliente_telefono).replace(/\D/g, '') : '';
    const numFinal = rawTel.length === 10 ? `57${rawTel}` : rawTel;

    let mensaje = `COMPROBANTE FISCAL DE VENTA\n`;
    mensaje += `*N° Factura:* ${ticket.id_factura}\n`;
    mensaje += `*Sede:* ${ticket.nombre_bodega || 'Sede Principal'}\n`;
    mensaje += `*Fecha:* ${new Date(ticket.fecha_cobro || ticket.fecha).toLocaleString()}\n\n`;
    mensaje += `*Cliente:* ${ticket.cliente_nombre}\n`;
    mensaje += `*Método de Pago:* ${ticket.metodo_pago}\n\n`;
    mensaje += `*Detalle de Productos:*\n`;

    if (Array.isArray(ticket.items)) {
      ticket.items.forEach((it: any) => {
        mensaje += `- ${it.nombre} (${it.cantidad}x) - ${formatoCOP(it.precio * it.cantidad)}\n`;
      });
    }

    mensaje += `\n*TOTAL PAGADO:* ${formatoCOP(ticket.total)}\n\n`;
    mensaje += `Gracias por tu compra.`;

    const url = numFinal 
      ? `https://api.whatsapp.com/send?phone=${numFinal}&text=${encodeURIComponent(mensaje)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(mensaje)}`;

    window.open(url, '_blank');
  };

  // =========================================================================
  // 🛡️ MODAL ANULAR
  // =========================================================================
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
        usuario_anulo_nombre: userAuth?.nombre || 'Usuario LOBO',
        usuario_anulo_id: userAuth?.id_usuario || ''
      };

      const batch = writeBatch(db);
      const ventaRef = doc(db, 'ventas', docId);
      batch.set(ventaRef, updateData, { merge: true });

      if (Array.isArray(ventaAAnular.items)) {
        for (const item of ventaAAnular.items) {
          if (item.sku) {
            const prodRef = doc(db, 'productos', item.sku);
            const prodObj = productos.find(p => p.sku === item.sku);
            
            if (prodObj) {
              const currentStockMap = prodObj.stock || {};
              const stockActual = Number(currentStockMap[idSedeDevolucion] || 0);
              const stockDevuelto = stockActual + Number(item.cantidad || 1);

              batch.set(prodRef, {
                stock: {
                  ...currentStockMap,
                  [idSedeDevolucion]: stockDevuelto
                }
              }, { merge: true });
            }
          }
        }
      }

      await batch.commit();

      alert(`Venta N° ${ventaAAnular.id_factura} ANULADA y stock restablecido.`);
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

  const sucsActivas = sucursales.filter(s => s.estado !== 'INACTIVA');
  const sedeGarantizada = sedeDespacho || (sucsActivas.length > 0 ? sucsActivas[0].id_sucursal : '');

  const productosPOS = productos.filter(p => {
    const q = searchProd.toLowerCase().trim();
    const matchSearch = String(p.nombre || '').toLowerCase().includes(q) || String(p.sku || '').toLowerCase().includes(q);
    const stockEnSedeActiva = Number(p.stock?.[sedeGarantizada] || 0);

    return matchSearch && stockEnSedeActiva > 0;
  });

  const sedeActivaObj = sucursales.find(s => s.id_sucursal === sedeGarantizada);

  return (
    <div className="min-h-screen bg-[#F4F5F7] text-gray-800 p-4 md:p-8 font-sans relative pb-20">
      
      {/* CABECERA PRINCIPAL */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 border-b border-gray-200 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FFD800] border border-gray-800 animate-pulse"></span>
            <span className="text-[11px] font-satoshi-black text-gray-900 uppercase tracking-wider font-bold">
              Control Comercial 
            </span>
          </div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight font-satoshi-black">
            REGISTRO DE VENTAS
          </h1>
          <p className="text-xs text-gray-500 mt-0.5 font-satoshi-regular">
            {esVendedor 
              ? `Cajero Activo: ${userAuth?.nombre || 'Mi Caja'} | Sede: ${sedeActivaObj ? (sedeActivaObj.nombre || sedeActivaObj.NOMBRE) : 'Mi Sede'}`
              : 'Cobro rápido en mostrador, descuentos auditables y facturación en tiempo real.'}
          </p>
        </div>

        <div className="bg-white p-1 rounded-xl flex items-center gap-1 border border-gray-200 shrink-0 shadow-sm">
          <button
            type="button"
            onClick={() => setActiveTab('POS')}
            className={`px-4 py-2 rounded-lg text-xs font-satoshi-black transition flex items-center gap-2 ${
              activeTab === 'POS' ? 'bg-[#FFD800] text-[#222222] font-bold shadow-sm' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 00-4zm-8 2a2 2 0 100 4 2 2 0 00-4z" />
            </svg>
            <span>Caja Registradora (POS)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('HISTORIAL')}
            className={`px-4 py-2 rounded-lg text-xs font-satoshi-black transition flex items-center gap-2 ${
              activeTab === 'HISTORIAL' ? 'bg-[#FFD800] text-[#222222] font-bold shadow-sm' : 'text-gray-500 hover:text-gray-900'
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
            
            <div className="bg-white border border-gray-200 rounded-2xl p-3 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative flex-1 w-full">
                <svg className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input 
                  type="text" 
                  className="w-full bg-gray-50 border border-gray-300 focus:border-[#FFD800] focus:ring-2 focus:ring-[#FFD800]/20 rounded-xl pl-10 pr-4 py-2.5 text-xs text-gray-900 placeholder-gray-400 focus:outline-none transition-all font-satoshi-regular"
                  placeholder="Escribe el nombre o escanea el código SKU..."
                  value={searchProd}
                  onChange={(e) => setSearchQueryProd(e.target.value)}
                  autoFocus
                />
              </div>

              {/* CONTROLES: CONMUTADOR VISTA TARJETAS / TABLA + IVA */}
              <div className="flex items-center gap-2">
                <div className="bg-gray-100 p-1 rounded-xl flex items-center gap-1 border border-gray-200 shrink-0">
                  <button
                    type="button"
                    onClick={() => setViewModeProd('TARJETAS')}
                    className={`p-1.5 rounded-lg text-xs font-satoshi-black transition ${
                      viewModeProd === 'TARJETAS' ? 'bg-[#FFD800] text-[#222222] font-bold shadow-sm' : 'text-gray-500 hover:text-gray-900'
                    }`}
                    title="Vista Tarjetas"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewModeProd('TABLA')}
                    className={`p-1.5 rounded-lg text-xs font-satoshi-black transition ${
                      viewModeProd === 'TABLA' ? 'bg-[#FFD800] text-[#222222] font-bold shadow-sm' : 'text-gray-500 hover:text-gray-900'
                    }`}
                    title="Vista Tabla"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                    </svg>
                  </button>
                </div>

                <div className="flex items-center gap-2 bg-gray-50 px-3.5 py-2 rounded-xl border border-gray-300 shrink-0 select-none">
                  <input
                    type="checkbox"
                    id="ivaCheck"
                    checked={ivaIncluido}
                    onChange={(e) => setIvaIncluido(e.target.checked)}
                    className="rounded bg-white border-gray-300 text-[#222222] focus:ring-0 w-4 h-4 cursor-pointer accent-[#222222]"
                  />
                  <label htmlFor="ivaCheck" className="text-xs font-satoshi-black text-gray-800 cursor-pointer font-bold">
                    IVA Incluido
                  </label>
                </div>
              </div>
            </div>

            {/* VISTA 1: GRID DE PRODUCTOS EN TARJETAS */}
            {viewModeProd === 'TARJETAS' && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
                {productosPOS.map((prod, idx) => {
                  const stockSede = Number(prod.stock?.[sedeGarantizada] || 0);
                  const tarifaIvaProd = prod.iva !== undefined ? Number(prod.iva) : 19;

                  return (
                    <div
                      key={prod.sku || idx}
                      onClick={() => addToCart(prod)}
                      className="bg-white border border-gray-200 hover:border-[#FFD800] rounded-xl p-3 shadow-xs flex flex-col justify-between transition-all duration-200 cursor-pointer active:scale-95 group"
                    >
                      <div>
                        <div className="w-full h-24 rounded-lg bg-gray-50 border border-gray-200 mb-2 overflow-hidden flex items-center justify-center shrink-0">
                          {prod.imagen_url ? (
                            <img src={prod.imagen_url} alt={prod.nombre} className="w-full h-full object-cover group-hover:scale-105 transition" />
                          ) : (
                            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                            </svg>
                          )}
                        </div>

                        <h4 className="font-satoshi-black text-xs text-gray-900 uppercase truncate font-bold">
                          {prod.nombre}
                        </h4>
                        <p className="font-mono text-[10px] text-gray-500">SKU: {prod.sku}</p>
                      </div>

                      <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-between">
                        <div>
                          <span className="font-satoshi-black text-sm text-gray-900 block font-bold">
                            {formatoCOP(prod.plocal || prod.precio || 0)}
                          </span>
                          <span className="text-[9px] text-gray-500 block font-mono">
                            IVA: {tarifaIvaProd}%
                          </span>
                        </div>
                        <span className="text-[9px] font-satoshi-black px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 font-bold border border-gray-200">
                          Stk: {stockSede}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {productosPOS.length === 0 && (
                  <div className="col-span-full text-center py-12 bg-white rounded-2xl border border-gray-200 p-6 text-gray-500 text-xs font-satoshi-regular">
                    No hay productos disponibles con stock en la sede seleccionada.
                  </div>
                )}
              </div>
            )}

            {/* VISTA 2: TABLA DE PRODUCTOS */}
            {viewModeProd === 'TABLA' && (
              <div className="bg-white border border-gray-200 rounded-2xl shadow-sm max-h-[calc(100vh-280px)] overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-[11px] font-satoshi-black text-gray-600 uppercase border-b border-gray-200">
                      <th className="p-3">Producto</th>
                      <th className="p-3 text-center">SKU</th>
                      <th className="p-3 text-center">Stock Sede</th>
                      <th className="p-3 text-right">Precio Unitario</th>
                      <th className="p-3 text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-satoshi-regular text-gray-800">
                    {productosPOS.map((prod, idx) => {
                      const stockSede = Number(prod.stock?.[sedeGarantizada] || 0);

                      return (
                        <tr key={prod.sku || idx} className="hover:bg-gray-50/50 transition">
                          <td className="p-3 font-satoshi-black text-gray-900 font-bold">{prod.nombre}</td>
                          <td className="p-3 text-center font-mono text-gray-500">{prod.sku}</td>
                          <td className="p-3 text-center font-mono font-bold text-gray-900">{stockSede} unds</td>
                          <td className="p-3 text-right font-satoshi-black text-gray-900 font-bold">{formatoCOP(prod.plocal || prod.precio || 0)}</td>
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => addToCart(prod)}
                              className="bg-[#FFD800] hover:bg-[#FDCB13] text-[#222222] font-satoshi-black px-2.5 py-1 rounded-lg text-xs font-bold shadow-xs"
                            >
                              + Agregar
                            </button>
                          </td>
                        </tr>
                      );
                    })}

                    {productosPOS.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-gray-500">No hay productos con stock en esta sede.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

          </div>

          {/* SECCIÓN DERECHA: COBRO Y DESCUENTOS AUDITABLES */}
          <div className="lg:col-span-5 space-y-4">
            
            <div className="bg-white border border-gray-200 rounded-2xl p-3.5 shadow-sm flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 truncate">
                <div className="w-8 h-8 rounded-lg bg-[#222222] text-[#FFD800] flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <div className="truncate">
                  <span className="text-[10px] font-satoshi-black text-gray-500 uppercase block font-bold">
                    {esVendedor ? 'Sede Asignada (Bloqueado)' : 'Sede Activa de Caja'}
                  </span>
                  <span className="text-xs font-satoshi-black text-gray-900 truncate block font-bold">
                    {sedeActivaObj ? (sedeActivaObj.nombre || sedeActivaObj.NOMBRE) : 'Seleccionar Sede'}
                  </span>
                </div>
              </div>

              <select
                className="bg-gray-50 border border-gray-300 text-xs font-satoshi-black text-gray-900 rounded-xl px-2.5 py-1.5 focus:outline-none cursor-pointer shrink-0 disabled:opacity-60 transition-all"
                value={sedeGarantizada}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSedeDespacho(e.target.value)}
                disabled={esVendedor}
              >
                {sucsActivas.map((s, idx) => (
                  <option key={s.id_sucursal || idx} value={s.id_sucursal} className="bg-white text-gray-900">
                    {s.nombre || s.NOMBRE}
                  </option>
                ))}
              </select>
            </div>

            {/* PANEL DE CARRITO Y EDICIÓN MANUAL */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between min-h-[480px]">
              <div className="space-y-3">
                <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                  <h3 className="text-xs font-satoshi-black text-gray-900 uppercase tracking-wider font-bold">
                    Carrito de Compra ({cart.reduce((a, c) => a + c.cantidad, 0)})
                  </h3>
                  {cart.length > 0 && (
                    <button type="button" onClick={() => setCart([])} className="text-[11px] text-red-600 hover:underline font-bold">
                      Vaciar
                    </button>
                  )}
                </div>

                {/* CANTIDAD MANUAL + BOTONES + Y - */}
                <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
                  {cart.map((item) => (
                    <div key={item.sku} className="bg-gray-50 rounded-xl p-2.5 border border-gray-200 flex items-center justify-between gap-2">
                      <div className="truncate flex-1">
                        <div className="text-xs font-satoshi-black text-gray-900 truncate font-bold">{item.nombre}</div>
                        <div className="text-[10px] text-gray-500">
                          {formatoCOP(item.precio)} c/u (IVA {item.tarifaIva}%)
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button type="button" onClick={() => updateQuantity(item.sku, -1)} className="w-6 h-6 bg-gray-200 text-gray-800 rounded-lg font-satoshi-black text-xs hover:bg-gray-300 font-bold">-</button>
                        
                        <input
                          type="number"
                          min="1"
                          value={item.cantidad}
                          onChange={(e) => handleQuantityManualChange(item.sku, Number(e.target.value))}
                          className="w-12 bg-white border border-gray-300 rounded-lg text-center font-satoshi-black text-xs text-gray-900 font-bold py-0.5 focus:outline-none focus:border-[#FFD800] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />

                        <button type="button" onClick={() => updateQuantity(item.sku, 1)} className="w-6 h-6 bg-gray-200 text-gray-800 rounded-lg font-satoshi-black text-xs hover:bg-gray-300 font-bold">+</button>
                        <button type="button" onClick={() => removeFromCart(item.sku)} className="ml-1 text-gray-400 hover:text-red-600 text-xs font-bold">✕</button>
                      </div>
                    </div>
                  ))}
                  {cart.length === 0 && (
                    <div className="text-center py-8 text-gray-400 text-xs">Haz clic en los productos para agregarlos al cobro.</div>
                  )}
                </div>
              </div>

              {/* MÓDULO DE DESCUENTOS Y BUSCADOR INTELIGENTE DE CLIENTES */}
              <div className="space-y-3 pt-3 border-t border-gray-100">
                
                {/* APLICACIÓN DE DESCUENTO */}
                <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[11px] font-satoshi-black text-gray-900 uppercase font-bold">
                      Descuento Auditable
                    </label>
                    <div className="flex gap-1 text-[10px] font-satoshi-black">
                      <button
                        type="button"
                        onClick={() => setTipoDescuento('FIJO')}
                        className={`px-2 py-0.5 rounded font-bold ${tipoDescuento === 'FIJO' ? 'bg-[#FFD800] text-[#222222]' : 'bg-gray-200 text-gray-600'}`}
                      >
                        Fijo ($)
                      </button>
                      <button
                        type="button"
                        onClick={() => setTipoDescuento('PORCENTAJE')}
                        className={`px-2 py-0.5 rounded font-bold ${tipoDescuento === 'PORCENTAJE' ? 'bg-[#FFD800] text-[#222222]' : 'bg-gray-200 text-gray-600'}`}
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
                      className="bg-white border border-gray-300 rounded-lg p-2 text-xs text-gray-900 focus:outline-none focus:border-[#FFD800] font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      value={montoDescuento}
                      onChange={(e) => setMontoDescuento(e.target.value ? Number(e.target.value) : '')}
                    />
                    <input
                      type="text"
                      placeholder="Motivo (Obligatorio)..."
                      className="bg-white border border-gray-300 rounded-lg p-2 text-xs text-gray-900 focus:outline-none focus:border-[#FFD800]"
                      value={motivoDescuento}
                      onChange={(e) => setMotivoDescuento(e.target.value)}
                    />
                  </div>
                </div>

                {/* BUSCADOR DE CLIENTES */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="relative" ref={clienteRef}>
                    <label className="block text-[10px] font-satoshi-black text-gray-600 uppercase mb-1 font-bold">
                      Buscar Cliente *
                    </label>
                    <input
                      type="text"
                      placeholder="-- Seleccionar Cliente --"
                      className={`w-full bg-gray-50 border text-xs text-gray-900 rounded-xl p-2 focus:outline-none font-satoshi-black ${
                        clienteSelObj ? 'border-[#222222] font-bold' : 'border-gray-300 focus:border-[#FFD800]'
                      }`}
                      value={clienteSearch || (clienteSelObj ? clienteSelObj.nombre : '')}
                      onFocus={() => {
                        if (clienteSelObj) {
                          setClienteSearch(clienteSelObj.nombre);
                        } else {
                          setClienteSearch('');
                        }
                        setShowClienteDropdown(true);
                      }}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        setClienteSearch(e.target.value);
                        setShowClienteDropdown(true);
                      }}
                    />

                    {/* POPUP DE SELECCIÓN DE CLIENTE */}
                    {showClienteDropdown && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto z-[100] divide-y divide-gray-100 text-xs">
                        <div
                          onClick={() => {
                            setClienteSelObj({ nit: 'CF_GENERAL', nombre: 'Consumidor Final (CF)' });
                            setClienteSearch('');
                            setShowClienteDropdown(false);
                          }}
                          className="p-2.5 hover:bg-gray-50 cursor-pointer text-gray-900 font-satoshi-black font-bold flex justify-between items-center"
                        >
                          <span>Consumidor Final (CF)</span>
                          <span className="text-[10px] bg-gray-100 px-2 py-0.5 rounded border border-gray-200">Elegir</span>
                        </div>

                        {clientesFiltradosPOS.map((cli, idx) => (
                          <div
                            key={cli.id_cliente || idx}
                            onClick={() => {
                              setClienteSelObj(cli);
                              setClienteSearch('');
                              setShowClienteDropdown(false);
                            }}
                            className="p-2.5 hover:bg-gray-50 cursor-pointer text-gray-800 flex justify-between items-center"
                          >
                            <div>
                              <div className="font-satoshi-black text-gray-900 font-bold">{cli.nombre}</div>
                              <div className="text-[10px] text-gray-500 font-mono">NIT/ID: {cli.nit || cli.id_cliente}</div>
                            </div>
                            <span className="text-[10px] bg-gray-100 text-gray-700 px-2 py-0.5 rounded border border-gray-200 font-bold">Elegir</span>
                          </div>
                        ))}

                        {clientesFiltradosPOS.length === 0 && (
                          <div className="p-3 text-gray-500 text-center text-[11px]">No se encontraron clientes.</div>
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-[10px] font-satoshi-black text-gray-600 uppercase mb-1 font-bold">Método de Pago</label>
                    <select
                      className="w-full bg-gray-50 border border-gray-300 text-xs text-gray-900 font-satoshi-black focus:border-[#FFD800] focus:ring-2 focus:ring-[#FFD800]/20 rounded-xl p-2 focus:outline-none cursor-pointer transition-all"
                      value={metodoPago}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setMetodoPago(e.target.value as any)}
                    >
                      <option value="EFECTIVO">Efectivo</option>
                      <option value="TRANSFERENCIA">Transferencia / Nequi</option>
                      <option value="TARJETA">Tarjeta Débito/Crédito</option>
                    </select>
                  </div>
                </div>

                {/* LIQUIDACIÓN FINAL */}
                <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 space-y-1 text-xs">
                  <div className="flex justify-between text-gray-600">
                    <span>Subtotal Bruto:</span>
                    <span>{formatoCOP(subtotalBrutoCarrito)}</span>
                  </div>

                  {valorDescuentoEfectivo > 0 && (
                    <div className="flex justify-between text-amber-800 font-satoshi-black font-bold">
                      <span>Descuento Aplicado:</span>
                      <span>-{formatoCOP(valorDescuentoEfectivo)}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-gray-600">
                    <span>Base Gravable:</span>
                    <span>{formatoCOP(baseGravableTotal)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>IVA Calculado:</span>
                    <span>{formatoCOP(ivaMontoTotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-satoshi-black text-gray-900 pt-1 border-t border-gray-200 font-bold">
                    <span>TOTAL A COBRAR:</span>
                    <span className="text-gray-900">{formatoCOP(totalCobroPOS)}</span>
                  </div>
                </div>

                {metodoPago === 'EFECTIVO' && (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="block text-[10px] font-satoshi-black text-gray-600 uppercase mb-1 font-bold">Paga Con ($)</label>
                      <input
                        type="number"
                        className="w-full bg-gray-50 border border-gray-300 focus:border-[#FFD800] focus:ring-2 focus:ring-[#FFD800]/20 rounded-xl p-2 text-gray-900 focus:outline-none font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        value={montoPagaCon}
                        onChange={(e) => setMontoPagaCon(Number(e.target.value))}
                      />
                    </div>
                    {cambioDevuelto > 0 && (
                      <div className="bg-gray-50 p-2 rounded-xl border border-gray-200 flex flex-col justify-center">
                        <span className="text-[9px] text-gray-500 font-satoshi-black uppercase font-bold">Cambio Devuelto:</span>
                        <span className="text-amber-800 font-satoshi-black text-xs font-bold">{formatoCOP(cambioDevuelto)}</span>
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleCobrarVenta}
                  disabled={cart.length === 0 || isProcessing || (Number(montoDescuento) > 0 && !motivoDescuento.trim())}
                  className="w-full bg-[#FFD800] hover:bg-[#FDCB13] disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-[#222222] font-satoshi-black p-3.5 rounded-xl text-xs uppercase tracking-wider transition-all duration-300 shadow-sm flex items-center justify-center gap-2 font-bold"
                >
                  {isProcessing ? (
                    <span>Procesando Venta...</span>
                  ) : (
                    <>
                      <svg className="w-5 h-5 text-[#222222]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          <div className="bg-white border border-gray-200 rounded-2xl p-3 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="relative w-full md:w-80">
              <svg className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input 
                type="text" 
                className="w-full bg-gray-50 border border-gray-300 focus:border-[#FFD800] focus:ring-2 focus:ring-[#FFD800]/20 rounded-xl pl-10 pr-3 py-2.5 text-xs text-gray-900 placeholder-gray-400 focus:outline-none transition-all font-satoshi-regular"
                placeholder="Buscar por ID Factura o Cliente..."
                value={searchHistorial}
                onChange={(e) => setSearchHistorial(e.target.value)}
              />
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 text-[11px] font-satoshi-black text-gray-600 uppercase tracking-wider border-b border-gray-200">
                  <th className="p-4 rounded-tl-2xl">N° Factura</th>
                  <th className="p-4">Fecha / Hora</th>
                  <th className="p-4">Cliente</th>
                  <th className="p-4">Vendedor</th>
                  <th className="p-4">Descuento Auditoría</th>
                  <th className="p-4 text-right">Total</th>
                  <th className="p-4 text-center">Estado</th>
                  <th className="p-4 text-center rounded-tr-2xl">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs font-satoshi-regular text-gray-800">
                {ventasHistorialFiltradas.map((v, idx) => {
                  const isAnulada = v.estado === 'ANULADA';
                  const tieneDescuento = v.descuento_monto && v.descuento_monto > 0;

                  return (
                    <tr key={v.id_doc || idx} className="hover:bg-gray-50/50 transition-colors">
                      <td className="p-4 font-mono font-bold text-gray-900">{v.id_factura}</td>
                      <td className="p-4 text-gray-600">{new Date(v.fecha_cobro || v.fecha).toLocaleString()}</td>
                      <td className="p-4 text-gray-600">{v.cliente_nombre}</td>
                      <td className="p-4 text-gray-900 font-satoshi-black font-bold">{v.vendedor_nombre}</td>
                      
                      <td className="p-4">
                        {tieneDescuento ? (
                          <div>
                            <span className="text-amber-800 font-satoshi-black font-bold">
                              -{formatoCOP(v.descuento_monto)}
                            </span>
                            <span className="text-[10px] text-gray-500 block italic truncate max-w-xs">
                              &quot;{v.descuento_motivo}&quot;
                            </span>
                          </div>
                        ) : (
                          <span className="text-gray-400 font-mono">Sin Desc.</span>
                        )}
                      </td>

                      <td className="p-4 text-right font-satoshi-black text-gray-900 text-sm font-bold">{formatoCOP(v.total)}</td>
                      <td className="p-4 text-center">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-satoshi-black font-bold ${
                          isAnulada ? 'bg-red-100 text-red-800 border border-red-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        }`}>
                          {v.estado || 'PAGADA'}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => { setSelectedVentaTicket(v); setShowTicketModal(true); }}
                            className="bg-gray-100 text-gray-900 border border-gray-300 font-satoshi-black px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-gray-200 transition"
                          >
                            Ver Ticket
                          </button>
                          {!isAnulada && (
                            <button
                              type="button"
                              onClick={() => handleOpenAnular(v)}
                              className="bg-red-50 text-red-600 border border-red-200 font-satoshi-black px-2.5 py-1.5 rounded-lg text-xs font-bold hover:bg-red-100 transition"
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

      {/* MODAL COMPROBANTE FISCAL / TICKET TIPO PAPEL TÉRMICO */}
      {showTicketModal && selectedVentaTicket && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white text-gray-900 rounded-3xl w-full max-w-md p-8 shadow-2xl font-mono text-xs relative space-y-5 border border-gray-200">
            
            <button 
              onClick={() => setShowTicketModal(false)} 
              className="absolute right-5 top-5 text-gray-400 hover:text-gray-700 transition"
            >
              ✕
            </button>

            {/* ENCABEZADO DEL COMPROBANTE */}
            <div className="text-center space-y-1">
              <h2 className="font-satoshi-black font-black text-lg tracking-wider text-gray-900 uppercase">
                FACTURA / COMPROBANTE FISCAL
              </h2>
              <p className="text-xs font-satoshi-black text-gray-700 font-bold">
                {selectedVentaTicket.vendedor_nombre || userAuth?.nombre || 'Atención POS'}
              </p>
              <p className="text-[11px] text-gray-500 font-mono">
                N° {selectedVentaTicket.id_factura}
              </p>
              <p className="text-[11px] text-gray-500 font-mono">
                Ref Orden: {selectedVentaTicket.ref_orden || 'N/A'}
              </p>
            </div>

            <div className="border-b border-dashed border-gray-300" />

            {/* DATOS DEL CLIENTE */}
            <div className="space-y-1 text-[11px] text-gray-700">
              <p><strong className="text-gray-900">CLIENTE:</strong> {selectedVentaTicket.cliente_nombre || 'Consumidor Final (CF)'}</p>
              <p><strong className="text-gray-900">NIT/CC:</strong> {selectedVentaTicket.cliente_nit || 'CF_GENERAL'}</p>
              <p><strong className="text-gray-900">CORREO:</strong> {selectedVentaTicket.cliente_correo || 'cliente@general.com'}</p>
              <p><strong className="text-gray-900">TELÉFONO:</strong> {selectedVentaTicket.cliente_telefono || 'N/A'}</p>
              <p><strong className="text-gray-900">DIRECCIÓN:</strong> {selectedVentaTicket.cliente_direccion || 'N/A'}</p>
              <p><strong className="text-gray-900">CIUDAD:</strong> {selectedVentaTicket.cliente_ciudad || 'Cali'}</p>
              <p><strong className="text-gray-900">MÉTODO:</strong> {selectedVentaTicket.metodo_pago || 'EFECTIVO'}</p>
            </div>

            <div className="border-b border-dashed border-gray-300" />

            {/* LISTA DE PRODUCTOS VENDIDOS */}
            <div className="space-y-3">
              {Array.isArray(selectedVentaTicket.items) && selectedVentaTicket.items.map((it: any, i: number) => {
                const tarifaIvaItem = it.tarifaIva || 19;
                const totalItem = (it.precio || 0) * (it.cantidad || 1);

                return (
                  <div key={i} className="flex justify-between items-start text-xs">
                    <div>
                      <div className="font-bold text-gray-900">{it.nombre}</div>
                      <div className="text-[10px] text-gray-500">
                        Cant: {it.cantidad} x {formatoCOP(it.precio)} (IVA {tarifaIvaItem}%)
                      </div>
                    </div>
                    <span className="font-bold text-gray-900">{formatoCOP(totalItem)}</span>
                  </div>
                );
              })}
            </div>

            <div className="border-b border-dashed border-gray-300" />

            {/* CÁLCULO Y LIQUIDACIÓN IMPOSITIVA */}
            <div className="space-y-1.5 pt-1 text-gray-700 text-xs">
              <div className="flex justify-between">
                <span>Subtotal Gravable:</span>
                <span className="font-mono text-gray-900 font-bold">{formatoCOP(selectedVentaTicket.subtotal || selectedVentaTicket.total)}</span>
              </div>
              <div className="flex justify-between">
                <span>IVA Discriminado:</span>
                <span className="font-mono text-gray-900 font-bold">{formatoCOP(selectedVentaTicket.iva_monto || 0)}</span>
              </div>

              <div className="border-b border-gray-900 pt-1" />

              <div className="flex justify-between text-base font-black text-gray-900 pt-1">
                <span>TOTAL:</span>
                <span className="font-mono">{formatoCOP(selectedVentaTicket.total)}</span>
              </div>
            </div>

            {/* BOTONES DE IMPRESIÓN Y ENVÍO POR WHATSAPP */}
            <div className="pt-2 space-y-2">
              <button
                type="button"
                onClick={() => handleEnviarWhatsAppTicket(selectedVentaTicket)}
                className="w-full bg-[#25D366] hover:bg-[#20bd5a] text-white font-satoshi-black py-3 rounded-2xl text-xs uppercase tracking-wider transition-all duration-300 shadow-sm flex items-center justify-center gap-2 font-bold"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.653-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.633.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
                </svg>
                <span>ENVIAR COMPROBANTE POR WHATSAPP</span>
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                className="w-full bg-[#222222] hover:bg-[#333333] text-white font-satoshi-black py-3.5 rounded-2xl text-xs uppercase tracking-wider transition-all duration-300 shadow-sm flex items-center justify-center gap-2 font-bold"
              >
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                <span>IMPRIMIR COMPROBANTE PDF</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL ANULACIÓN */}
      {showModalAnular && ventaAAnular && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-md shadow-2xl font-sans space-y-4 text-gray-800">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <h3 className="text-lg font-satoshi-black text-gray-900 uppercase font-bold">Anular Venta N° {ventaAAnular.id_factura}</h3>
              <button onClick={() => setShowModalAnular(false)} className="text-gray-400 hover:text-gray-700">✕</button>
            </div>

            <form onSubmit={handleConfirmarAnulacion} className="space-y-4">
              <div>
                <label className="block text-xs font-satoshi-black text-gray-700 uppercase mb-2 font-bold">Motivo *</label>
                <textarea
                  rows={3}
                  className="w-full bg-gray-50 border border-gray-300 rounded-xl p-3 text-xs text-gray-900 focus:outline-none focus:border-[#FFD800] focus:ring-2 focus:ring-[#FFD800]/20 transition-all font-satoshi-regular"
                  placeholder="Justificación de anulación..."
                  value={motivoAnulacion}
                  onChange={(e) => setMotivoAnulacion(e.target.value)}
                  required
                />
              </div>

              <div className="flex gap-3">
                <button type="button" onClick={() => setShowModalAnular(false)} className="flex-1 bg-gray-100 text-gray-700 font-satoshi-black py-3 rounded-xl text-xs uppercase hover:bg-gray-200 transition-colors">Cancelar</button>
                <button type="submit" disabled={isAnulando} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-satoshi-black py-3 rounded-xl text-xs uppercase disabled:opacity-50 transition-colors font-bold shadow-sm">
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
