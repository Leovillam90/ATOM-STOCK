'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { collection, query, where, getDocs, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import '@/app/globals.css';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const [userAuth, setUserAuth] = useState<any>(null);
  const [loadingSession, setLoadingSession] = useState(true);

  // Estados de Conteo de Colecciones para Alertas Dinámicas en el Menú
  const [numSucursales, setNumSucursales] = useState<number | null>(null);
  const [numVendedores, setNumVendedores] = useState<number | null>(null);
  const [numProductos, setNumProductos] = useState<number | null>(null);

  // Popover de Usuario (Pie del Sidebar)
  const [showUserPopover, setShowUserPopover] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Tooltip Informativo para Conexiones E-Commerce
  const [showEcommerceTooltip, setShowEcommerceTooltip] = useState(false);

  // Formularios de Autenticación
  const [userField, setUserField] = useState('');
  const [passField, setPassField] = useState('');
  const [loadingAction, setLoadingAction] = useState(false);

  useEffect(() => {
    const savedUser = localStorage.getItem('atom_user_session');
    if (savedUser) {
      try {
        setUserAuth(JSON.parse(savedUser));
      } catch (e) {
        localStorage.removeItem('atom_user_session');
      }
    }
    setLoadingSession(false);
  }, []);

  // Escuchar Colecciones de Firestore en tiempo real para evaluar conteos
  useEffect(() => {
    if (!userAuth || !userAuth.id_cuenta) return;

    const qSuc = query(collection(db, 'sucursales'), where('id_cuenta', '==', userAuth.id_cuenta));
    const unsubSuc = onSnapshot(qSuc, (snap) => setNumSucursales(snap.docs.length));

    const qVend = query(collection(db, 'usuarios'), where('id_cuenta', '==', userAuth.id_cuenta));
    const unsubVend = onSnapshot(qVend, (snap) => setNumVendedores(snap.docs.length));

    const qProd = query(collection(db, 'productos'), where('id_cuenta', '==', userAuth.id_cuenta));
    const unsubProd = onSnapshot(qProd, (snap) => setNumProductos(snap.docs.length));

    return () => {
      unsubSuc();
      unsubVend();
      unsubProd();
    };
  }, [userAuth]);

  // Cerrar Popover al hacer clic afuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setShowUserPopover(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userField || !passField) return alert('Ingresa tu correo y contraseña.');

    setLoadingAction(true);
    try {
      const term = userField.trim().toLowerCase();
      const qMin = query(collection(db, 'usuarios'), where('user', '==', term));
      let snap = await getDocs(qMin);

      if (snap.empty) {
        alert('Usuario no encontrado.');
        setLoadingAction(false);
        return;
      }

      const userDoc = snap.docs[0];
      const userData = userDoc.data();

      if ((userData.pass || userData.PASS) !== passField.trim()) {
        alert('Contraseña incorrecta.');
        setLoadingAction(false);
        return;
      }

      const idCuenta = userData.id_cuenta || userData.ID_CUENTA;
      let empresaNom = 'ATOM STOCK';

      if (idCuenta) {
        const docCta = await getDoc(doc(db, 'cuentas', idCuenta));
        if (docCta.exists()) {
          empresaNom = docCta.data().nombre_empresa || 'ATOM STOCK';
        }
      }

      const userRol = userData.rol || 'ADMIN';

      const sessionObj = {
        id_usuario: userDoc.id,
        nombre: userData.nombre || 'Usuario ATOM',
        rol: userRol,
        user: userData.user || term,
        id_cuenta: idCuenta,
        empresa: empresaNom,
        id_sucursal: userData.id_sucursal || '',
        sedes_asignadas: userData.sedes_asignadas || (userData.id_sucursal ? [userData.id_sucursal] : [])
      };

      setUserAuth(sessionObj);
      localStorage.setItem('atom_user_session', JSON.stringify(sessionObj));

      // REDIRECCIÓN INTELIGENTE SEGÚN EL ROL AL INICIAR SESIÓN
      if (userRol === 'ADMIN') {
        router.push('/reportes');
      } else if (userRol === 'GERENTE_BODEGA') {
        router.push('/productos');
      } else {
        // VENDEDOR / CAJERO POS
        router.push('/ventas');
      }

    } catch (err: any) {
      alert('Error de conexión: ' + err.message);
    } finally {
      setLoadingAction(false);
    }
  };

  const handleLogout = () => {
    setUserAuth(null);
    localStorage.removeItem('atom_user_session');
    router.push('/');
  };

  // Evaluar si la cuenta está completamente vacía para activar el Wizard de Onboarding (Solo Admin)
  const esCuentaNueva = numSucursales === 0 && numProductos === 0;

  // Rol activo del usuario
  const rolActual = userAuth?.rol || 'ADMIN';

  // Mapeo Estructurado de Navegación Lateral con Control de Permisos por Rol
  const menuItems = [
    {
      label: 'Reportes / Analytics',
      path: '/reportes',
      disabled: false,
      badge: null,
      rolesPermitidos: ['ADMIN'], // Solo Admin
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 012-2h2a2 2 0 012 2v6m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2M5 19V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2z" />
        </svg>
      )
    },
    {
      label: 'Sucursales / Sedes',
      path: '/sucursales',
      disabled: false,
      rolesPermitidos: ['ADMIN', 'GERENTE_BODEGA'], // ✅ Visible para Gerente de Bodega y Admin
      badge: numSucursales === 0 ? (
        <span className="bg-[#C81FDA]/15 text-[#C81FDA] border border-[#C81FDA]/40 text-[9px] font-satoshi-black px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
          ! Ingresar
        </span>
      ) : null,
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      )
    },
    {
      label: 'Catálogo Productos',
      path: '/productos',
      disabled: false,
      rolesPermitidos: ['ADMIN', 'GERENTE_BODEGA', 'VENDEDOR'], // ✅ Visible para todos
      badge: numProductos === 0 ? (
        <span className="bg-red-950/60 text-red-400 border border-red-800/40 text-[9px] font-satoshi-black px-2 py-0.5 rounded-full uppercase tracking-wider">
          Sin datos
        </span>
      ) : null,
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      )
    },
    {
      label: 'Clientes / Directorio',
      path: '/clientes',
      disabled: false,
      badge: null,
      rolesPermitidos: ['ADMIN', 'GERENTE_BODEGA', 'VENDEDOR'], // ✅ Visible para todos
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 012-2h2a2 2 0 012 2v1m-4 0h4m-6 7a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 3h3" />
        </svg>
      )
    },
    {
      label: 'Registro de Ventas',
      path: '/ventas',
      disabled: false,
      badge: null,
      rolesPermitidos: ['ADMIN', 'VENDEDOR'], // ❌ Oculto temporalmente para Gerente de Bodega
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
        </svg>
      )
    },
    {
      label: 'Facturación',
      path: '/facturas',
      disabled: false,
      badge: null,
      rolesPermitidos: ['ADMIN', 'VENDEDOR'], // ❌ Oculto para Gerente de Bodega
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 01-2-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      )
    },
    {
      label: 'Equipo / Vendedores',
      path: '/vendedores',
      disabled: false,
      rolesPermitidos: ['ADMIN'], // Solo Admin
      badge: numVendedores === 0 || numVendedores === 1 ? (
        <span className="bg-amber-950/60 text-amber-300 border border-amber-800/40 text-[9px] font-satoshi-black px-2 py-0.5 rounded-full uppercase tracking-wider">
          + Añadir
        </span>
      ) : null,
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      )
    },
    {
      label: 'Conexiones E-Commerce',
      path: '/integraciones',
      disabled: true,
      rolesPermitidos: ['ADMIN'], // Solo Admin
      badge: (
        <span className="bg-[#6884C5]/20 text-[#6884C5] border border-[#6884C5]/40 text-[9px] font-satoshi-black px-2 py-0.5 rounded-full uppercase tracking-wider">
          PROX.
        </span>
      ),
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      )
    },
  ];

  // FILTRADO DINÁMICO DEL MENÚ SEGÚN EL ROL ACTIVO
  const menuVisibles = menuItems.filter(item => item.rolesPermitidos.includes(rolActual));

  if (loadingSession) {
    return (
      <html lang="es">
        <body className="bg-[#1D2935] min-h-screen flex items-center justify-center text-slate-300 font-sans">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-[#0DE8C0] border-t-transparent rounded-full animate-spin"></div>
            <span className="text-xs font-semibold tracking-wider uppercase">Cargando ATOM STOCK...</span>
          </div>
        </body>
      </html>
    );
  }

  if (!userAuth) {
    return (
      <html lang="es">
        <body className="bg-[#1D2935] min-h-screen text-slate-100 antialiased font-sans select-none flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#253443] border border-slate-700/60 p-8 rounded-2xl shadow-2xl space-y-6">
            <div className="text-center">
              <h1 className="text-3xl font-black text-white font-satoshi-black">
                ATOM <span className="text-[#0DE8C0]">STOCK</span>
              </h1>
              <p className="text-xs text-slate-400 mt-1 font-satoshi-regular">Suite de Control Multibodega Omnicanal</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-satoshi-black text-white uppercase tracking-wider mb-2">Usuario / Correo</label>
                <input
                  type="text"
                  className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl p-3.5 text-sm text-white focus:outline-none transition font-satoshi-regular"
                  value={userField}
                  onChange={(e) => setUserField(e.target.value)}
                  placeholder="admin@atomstock.com"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-satoshi-black text-white uppercase tracking-wider mb-2">Contraseña</label>
                <input
                  type="password"
                  className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl p-3.5 text-sm text-white focus:outline-none transition font-satoshi-regular"
                  value={passField}
                  onChange={(e) => setPassField(e.target.value)}
                  placeholder="••••••••••••"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loadingAction}
                className="w-full bg-[#0DE8C0] hover:bg-[#0bcfa8] text-[#1D2935] font-satoshi-black py-3.5 rounded-xl text-xs uppercase tracking-wider transition duration-300 shadow-lg"
              >
                {loadingAction ? 'Validando Acceso...' : 'Ingresar'}
              </button>
            </form>
          </div>
        </body>
      </html>
    );
  }

  // Cálculo de Progreso para el Setup Wizard de Onboarding Inicial
  let pasocumplidoCount = 0;
  if (numSucursales && numSucursales > 0) pasocumplidoCount++;
  if (numProductos && numProductos > 0) pasocumplidoCount++;
  if (numVendedores && numVendedores > 1) pasocumplidoCount++;
  const porcentajeProgreso = Math.round((pasocumplidoCount / 3) * 100);

  return (
    <html lang="es">
      <body className="bg-[#1D2935] text-slate-100 min-h-screen flex antialiased font-sans">

        {/* SIDEBAR CON MARCA OFICIAL #1D2935 */}
        <aside className="w-64 bg-[#1D2935] border-r border-slate-700/60 text-white min-h-screen flex flex-col justify-between p-4 shadow-xl shrink-0">
          <div>
            <div className="p-3 border-b border-slate-700/60 mb-6 flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#0DE8C0] to-purple-600 flex items-center justify-center font-satoshi-black text-white text-xs shadow-inner">
                A
              </div>
              <div className="truncate">
                <div className="text-sm font-satoshi-black text-white truncate tracking-wide">
                  ATOM STOCK
                </div>
                <div className="text-[10px] text-[#0DE8C0] font-satoshi-black uppercase tracking-wider">
                  {rolActual === 'ADMIN' ? 'SUITE OMNICANAL' : `ROL: ${rolActual}`}
                </div>
              </div>
            </div>

            <nav className="space-y-1">
              {menuVisibles.map((item) => {
                const isActive = pathname === item.path;

                if (item.disabled) {
                  return (
                    <div key={item.path} className="relative">
                      <button
                        type="button"
                        onClick={() => setShowEcommerceTooltip(!showEcommerceTooltip)}
                        className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-satoshi-regular text-slate-500 hover:text-slate-400 cursor-not-allowed transition-all opacity-70"
                      >
                        <div className="flex items-center gap-3 truncate">
                          <span className="text-slate-500">{item.icon}</span>
                          <span className="truncate">{item.label}</span>
                        </div>
                        {item.badge}
                      </button>

                      {showEcommerceTooltip && (
                        <div className="absolute left-full top-0 ml-2 w-48 bg-[#253443] border border-slate-700 text-white text-[11px] p-2.5 rounded-xl shadow-2xl z-50 animate-in fade-in">
                          <p className="font-satoshi-black text-[#0DE8C0] mb-0.5">Próximamente</p>
                          <p className="font-satoshi-regular text-slate-300">Esta función estará disponible muy pronto para vincular tus tiendas.</p>
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs transition-all relative ${
                      isActive
                        ? 'bg-[#0DE8C0]/10 text-[#0DE8C0] border-l-4 border-[#0DE8C0] font-satoshi-black shadow-sm'
                        : 'text-[#A0AEC0] hover:text-white hover:bg-[#253443]/60 font-satoshi-regular'
                    }`}
                  >
                    <div className="flex items-center gap-3 truncate">
                      <span className={isActive ? 'text-[#0DE8C0]' : 'text-[#A0AEC0]'}>{item.icon}</span>
                      <span className="truncate">{item.label}</span>
                    </div>
                    {item.badge}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* PIE DEL MENÚ CON POPOVER DE USUARIO */}
          <div className="relative pt-4 border-t border-slate-700/60" ref={popoverRef}>
            <button
              type="button"
              onClick={() => setShowUserPopover(!showUserPopover)}
              className="w-full flex items-center justify-between p-2.5 rounded-xl bg-[#253443] hover:bg-[#2c3d4f] border border-slate-700/50 transition cursor-pointer"
            >
              <div className="flex items-center gap-2.5 truncate">
                <div className="w-7 h-7 rounded-lg bg-[#0DE8C0]/20 text-[#0DE8C0] font-satoshi-black text-xs flex items-center justify-center">
                  {userAuth?.nombre ? userAuth.nombre.charAt(0).toUpperCase() : 'U'}
                </div>
                <div className="truncate text-left">
                  <div className="text-xs font-satoshi-black text-white truncate">{userAuth?.nombre}</div>
                  <div className="text-[9px] text-[#0DE8C0] font-satoshi-black uppercase">{userAuth?.rol || 'ADMIN'}</div>
                </div>
              </div>

              <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${showUserPopover ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
              </svg>
            </button>

            {showUserPopover && (
              <div className="absolute bottom-16 left-0 right-0 bg-[#253443] border border-slate-700 rounded-2xl p-3 shadow-2xl z-50 space-y-2 animate-in fade-in slide-in-from-bottom-2">
                <div className="p-2 border-b border-slate-700/60">
                  <p className="text-[10px] font-satoshi-black text-slate-400 uppercase">Cuenta de Acceso</p>
                  <p className="text-xs font-satoshi-regular text-white truncate">{userAuth?.user}</p>
                </div>

                <Link
                  href="/perfil"
                  onClick={() => setShowUserPopover(false)}
                  className="flex items-center gap-2.5 w-full p-2 text-xs font-satoshi-black text-slate-200 hover:bg-[#1D2935] hover:text-[#0DE8C0] rounded-xl transition"
                >
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>Configurar Perfil</span>
                </Link>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex items-center gap-2.5 w-full p-2 text-xs font-satoshi-black text-red-400 hover:bg-red-950/40 rounded-xl transition"
                >
                  <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  <span>Cerrar Sesión</span>
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* ÁREA DE CONTENIDO PRINCIPAL */}
        <main className="flex-1 overflow-y-auto">
          {esCuentaNueva && pathname === '/reportes' && rolActual === 'ADMIN' ? (
            <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-8 animate-in fade-in">
              
              {/* CABECERA WIZARD DE BIENVENIDA */}
              <div className="bg-[#253443] border border-slate-700/60 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-[#0DE8C0]/10 blur-3xl pointer-events-none rounded-full"></div>
                <h1 className="text-3xl font-black text-white font-satoshi-black tracking-tight">
                  ¡Bienvenido a ATOM STOCK! 🚀
                </h1>
                <p className="text-xs text-[#A0AEC0] mt-1 font-satoshi-regular max-w-xl">
                  Completa estos sencillos pasos para activar tu sistema de inventario y terminal POS multibodega.
                </p>

                {/* BARRA DE PROGRESO */}
                <div className="mt-6 pt-4 border-t border-slate-700/60 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-satoshi-black text-[#0DE8C0] uppercase tracking-wider">
                      Progreso de Configuración
                    </span>
                    <span className="font-satoshi-black text-white">
                      {porcentajeProgreso}% completado ({pasocumplidoCount} de 3 pasos)
                    </span>
                  </div>
                  <div className="w-full h-3 bg-[#1D2935] rounded-full overflow-hidden p-0.5 border border-slate-700">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#C81FDA] to-[#0DE8C0] transition-all duration-500"
                      style={{ width: `${Math.max(porcentajeProgreso, 5)}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              {/* TARJETAS DE PASOS RÁPIDOS */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* PASO 1: CREAR SUCURSAL */}
                <div className="bg-[#253443] border border-slate-700/60 rounded-2xl p-6 shadow-xl flex flex-col justify-between space-y-4 relative">
                  <div>
                    <div className="flex justify-between items-start mb-3">
                      <span className="w-8 h-8 rounded-xl bg-[#0DE8C0]/10 text-[#0DE8C0] font-satoshi-black flex items-center justify-center text-xs">
                        1
                      </span>
                      <span className="bg-[#C81FDA]/20 text-[#C81FDA] border border-[#C81FDA]/40 text-[9px] font-satoshi-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                        Requerido
                      </span>
                    </div>
                    <h3 className="font-satoshi-black text-base text-white uppercase tracking-wide">
                      Sede Principal
                    </h3>
                    <p className="text-xs text-[#A0AEC0] font-satoshi-regular mt-1 leading-relaxed">
                      Establece el punto físico o virtual desde donde despacharás o venderás productos.
                    </p>
                  </div>

                  <Link
                    href="/sucursales"
                    className="w-full bg-[#0DE8C0] hover:bg-[#0bcfa8] text-[#1D2935] font-satoshi-black py-3 rounded-xl text-xs uppercase tracking-wider transition-all duration-300 shadow-md text-center flex items-center justify-center gap-1.5"
                  >
                    <span>+ Crear Sede</span>
                  </Link>
                </div>

                {/* PASO 2: AGREGAR PRODUCTOS */}
                <div className="bg-[#253443] border border-slate-700/60 rounded-2xl p-6 shadow-xl flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex justify-between items-start mb-3">
                      <span className="w-8 h-8 rounded-xl bg-[#6884C5]/10 text-[#6884C5] font-satoshi-black flex items-center justify-center text-xs">
                        2
                      </span>
                      <span className="bg-slate-800 text-slate-400 text-[9px] font-satoshi-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                        Paso 2
                      </span>
                    </div>
                    <h3 className="font-satoshi-black text-base text-white uppercase tracking-wide">
                      Catálogo & Stock
                    </h3>
                    <p className="text-xs text-[#A0AEC0] font-satoshi-regular mt-1 leading-relaxed">
                      Crea tu catálogo manualmente o importa tu lista en Excel/CSV en segundos.
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Link
                      href="/productos"
                      className="flex-1 bg-[#1D2935] border border-[#6884C5] text-[#6884C5] hover:text-white font-satoshi-black py-2.5 rounded-xl text-[11px] uppercase tracking-wider text-center"
                    >
                      + Producto
                    </Link>
                    <Link
                      href="/productos"
                      className="flex-1 bg-[#6884C5] hover:bg-[#5772b0] text-white font-satoshi-black py-2.5 rounded-xl text-[11px] uppercase tracking-wider text-center"
                    >
                      Importar CSV
                    </Link>
                  </div>
                </div>

                {/* PASO 3: EQUIPO / VENDEDORES */}
                <div className="bg-[#253443] border border-slate-700/60 rounded-2xl p-6 shadow-xl flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex justify-between items-start mb-3">
                      <span className="w-8 h-8 rounded-xl bg-[#C81FDA]/10 text-[#C81FDA] font-satoshi-black flex items-center justify-center text-xs">
                        3
                      </span>
                      <span className="bg-slate-800 text-slate-400 text-[9px] font-satoshi-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                        Opcional
                      </span>
                    </div>
                    <h3 className="font-satoshi-black text-base text-white uppercase tracking-wide">
                      Equipo de Trabajo
                    </h3>
                    <p className="text-xs text-[#A0AEC0] font-satoshi-regular mt-1 leading-relaxed">
                      Asigna cajeros o administradores a tus sedes para controlar el flujo de caja.
                    </p>
                  </div>

                  <Link
                    href="/vendedores"
                    className="w-full bg-[#1D2935] hover:bg-[#15202b] text-[#0DE8C0] border border-[#0DE8C0]/40 font-satoshi-black py-3 rounded-xl text-xs uppercase tracking-wider transition-all duration-300 text-center"
                  >
                    <span>+ Añadir Vendedor</span>
                  </Link>
                </div>

              </div>

            </div>
          ) : (
            children
          )}
        </main>
      </body>
    </html>
  );
}