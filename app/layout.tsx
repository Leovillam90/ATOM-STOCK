'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { collection, query, where, getDocs, doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import '@/app/globals.css';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  // ==========================================
  // ESTADOS GLOBALES Y SESIÓN
  // ==========================================
  const [userAuth, setUserAuth] = useState<any>(null);
  const [loadingSession, setLoadingSession] = useState(true);

  // Estados de Conteo
  const [numSucursales, setNumSucursales] = useState<number | null>(null);
  const [numVendedores, setNumVendedores] = useState<number | null>(null);
  const [numProductos, setNumProductos] = useState<number | null>(null);

  const [showUserPopover, setShowUserPopover] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [showEcommerceTooltip, setShowEcommerceTooltip] = useState(false);

  // LISTA EXCLUSIVA DE PAÍSES E INDICATIVOS LATAM
  const paisesLatam = [
    { codigo: '+57', nombre: 'Colombia (+57)', bandera: '🇨🇴' },
    { codigo: '+593', nombre: 'Ecuador (+593)', bandera: '🇪🇨' },
    { codigo: '+52', nombre: 'México (+52)', bandera: '🇲🇽' },
    { codigo: '+595', nombre: 'Paraguay (+595)', bandera: '🇵🇾' },
    { codigo: '+51', nombre: 'Perú (+51)', bandera: '🇵🇪' },
    { codigo: '+56', nombre: 'Chile (+56)', bandera: '🇨🇱' },
    { codigo: '+507', nombre: 'Panamá (+507)', bandera: '🇵🇦' },
    { codigo: '+502', nombre: 'Guatemala (+502)', bandera: '🇬🇹' },
    { codigo: '+55', nombre: 'Brasil (+55)', bandera: '🇧🇷' },
    { codigo: '+54', nombre: 'Argentina (+54)', bandera: '🇦🇷' },
    { codigo: '+58', nombre: 'Venezuela (+58)', bandera: '🇻🇪' },
  ];

  // ESTADOS DE LOGIN/REGISTRO
  const [isRegister, setIsRegister] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [nombreField, setNombreField] = useState('');
  const [indicativoField, setIndicativoField] = useState('+57');
  const [telefonoField, setTelefonoField] = useState('');
  const [userField, setUserField] = useState('');
  const [passField, setPassField] = useState('');
  const [remember, setRemember] = useState(false);
  const [loadingAction, setLoadingAction] = useState(false);

  // SANITIZACIÓN: Extraer solo dígitos puros
  const obtenerNumeroPuro = (val: string) => {
    if (!val) return '';
    let str = String(val).trim();
    const codigos = ['+593', '+507', '+506', '+502', '+503', '+504', '+505', '+591', '+595', '+598', '+57', '+52', '+54', '+56', '+51', '+58', '+55', '+1'];
    
    for (const cod of codigos) {
      if (str.startsWith(cod)) {
        str = str.slice(cod.length).trim();
        break;
      }
    }
    return str.replace(/\D/g, '');
  };

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

  // Listeners de Colecciones
  useEffect(() => {
    if (!userAuth || !userAuth.id_cuenta) return;

    const qSuc = query(collection(db, 'sucursales'), where('id_cuenta', '==', userAuth.id_cuenta));
    const unsubSuc = onSnapshot(qSuc, (snap) => setNumSucursales(snap.docs.length), (err) => console.error(err));

    const qVend = query(collection(db, 'usuarios'), where('id_cuenta', '==', userAuth.id_cuenta));
    const unsubVend = onSnapshot(qVend, (snap) => setNumVendedores(snap.docs.length), (err) => console.error(err));

    const qProd = query(collection(db, 'productos'), where('id_cuenta', '==', userAuth.id_cuenta));
    const unsubProd = onSnapshot(qProd, (snap) => setNumProductos(snap.docs.length), (err) => console.error(err));

    return () => {
      unsubSuc();
      unsubVend();
      unsubProd();
    };
  }, [userAuth]);

  // Click Outside Popover
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
    if (!userField || !passField) return alert('Ingresa tu correo / usuario y contraseña.');
    if (!userField.includes('@')) return alert('Firebase Auth requiere que el usuario sea un correo electrónico válido.');

    setLoadingAction(true);
    const term = userField.trim().toLowerCase();

    try {
      if (isRegister) {
        if (!nombreField.trim() || !telefonoField.trim()) {
          setLoadingAction(false);
          return alert('Por favor ingresa el nombre de la empresa y tu número de celular.');
        }

        const userCredential = await createUserWithEmailAndPassword(auth, term, passField.trim());
        const idUsuarioAuth = userCredential.user.uid;

        const numLimpio = obtenerNumeroPuro(telefonoField);
        const idCuenta = `CTA_${Date.now().toString().slice(-8)}`;

        await setDoc(doc(db, 'cuentas', idCuenta), {
          id_cuenta: idCuenta,
          nombre_empresa: nombreField.trim(),
          telefono_contacto: numLimpio,
          indicativo_pais: indicativoField,
          email_contacto: term,
          rol_creador: 'ADMIN',
          fecha_creacion: new Date().toISOString(),
          estado: 'ACTIVO'
        });

        const usuarioAdminObj = {
          id_cuenta: idCuenta,
          id_usuario: idUsuarioAuth,
          id_sucursal: '',
          nombre: nombreField.trim(),
          telefono: numLimpio,
          indicativo_pais: indicativoField,
          user: term,
          email: term,
          rol: 'ADMIN',
          estado: 'ACTIVO',
          sedes_asignadas: [],
          fecha_creacion: new Date().toISOString()
        };

        await setDoc(doc(db, 'usuarios', idUsuarioAuth), usuarioAdminObj);

        const sessionObj = {
          ...usuarioAdminObj,
          empresa: nombreField.trim()
        };

        setUserAuth(sessionObj);
        localStorage.setItem('atom_user_session', JSON.stringify(sessionObj));
        alert('¡Empresa registrada con éxito de forma segura!');
        router.push('/reportes');

      } else {
        await signInWithEmailAndPassword(auth, term, passField.trim());

        const qEmail = query(collection(db, 'usuarios'), where('email', '==', term));
        let snap = await getDocs(qEmail);

        if (snap.empty) {
          const qUser = query(collection(db, 'usuarios'), where('user', '==', term));
          snap = await getDocs(qUser);
        }

        if (snap.empty) {
          alert('Tu cuenta está autenticada, pero no encontramos tu perfil en la base de datos.');
          setLoadingAction(false);
          return;
        }

        const userDoc = snap.docs[0];
        const userData = userDoc.data();

        const idCuenta = userData.id_cuenta || userData.ID_CUENTA;
        let empresaNom = 'LOBO STOCK';

        if (idCuenta) {
          const docCta = await getDoc(doc(db, 'cuentas', idCuenta));
          if (docCta.exists()) {
            empresaNom = docCta.data().nombre_empresa || 'LOBO STOCK';
          }
        }

        const userRol = String(userData.rol || 'ADMIN').toUpperCase();
        const numLimpioUser = obtenerNumeroPuro(userData.telefono || '');

        const sessionObj = {
          id_usuario: userDoc.id,
          nombre: userData.nombre || 'Usuario LOBO',
          telefono: numLimpioUser,
          indicativo_pais: userData.indicativo_pais || '+57',
          rol: userRol,
          user: userData.user || term,
          id_cuenta: idCuenta,
          empresa: empresaNom,
          id_sucursal: userData.id_sucursal || '',
          sedes_asignadas: userData.sedes_asignadas || (userData.id_sucursal ? [userData.id_sucursal] : [])
        };

        setUserAuth(sessionObj);
        localStorage.setItem('atom_user_session', JSON.stringify(sessionObj));

        if (userRol === 'ADMIN') {
          router.push('/reportes');
        } else if (userRol === 'GERENTE_BODEGA') {
          router.push('/productos');
        } else if (userRol === 'CONTABLE') {
          router.push('/facturas');
        } else {
          router.push('/ventas');
        }
      }

    } catch (err: any) {
      if (err.name !== 'AbortError') {
        if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
          alert('Credenciales incorrectas. Verifica tu correo y contraseña.');
        } else if (err.code === 'auth/email-already-in-use') {
          alert('Este correo ya está registrado en el sistema. Intenta iniciar sesión.');
        } else {
          alert('Error de conexión o credenciales inválidas: ' + err.message);
        }
        console.error(err);
      }
    } finally {
      setLoadingAction(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error cerrando sesión en Firebase:", error);
    }
    setUserAuth(null);
    localStorage.removeItem('atom_user_session');
    router.push('/');
  };

  const esCuentaNueva = numSucursales === 0 || numProductos === 0 || (numVendedores !== null && numVendedores <= 1);
  const rolActual = String(userAuth?.rol || 'ADMIN').toUpperCase();

  const menuItems = [
    {
      label: 'Reportes / Analytics',
      path: '/reportes',
      disabled: false,
      badge: null,
      rolesPermitidos: ['ADMIN', 'CONTABLE'],
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
      rolesPermitidos: ['ADMIN', 'GERENTE_BODEGA'],
      badge: numSucursales === 0 ? (
        <span className="bg-[#FF0055] text-white text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ml-auto shrink-0 inline-block text-center select-none shadow-none">
          ! INGRESAR
        </span>
      ) : null,
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      )
    },
    {
      label: 'Equipo / Vendedores',
      path: '/vendedores',
      disabled: false,
      rolesPermitidos: ['ADMIN'],
      badge: numVendedores === 0 || numVendedores === 1 ? (
        <span className="bg-[#FF0055] text-white text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ml-auto shrink-0 inline-block text-center select-none shadow-none">
          + AÑADIR
        </span>
      ) : null,
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      )
    },
    {
      label: 'Catálogo Productos',
      path: '/productos',
      disabled: false,
      rolesPermitidos: ['ADMIN', 'GERENTE_BODEGA', 'VENDEDOR'],
      badge: numProductos === 0 ? (
        <span className="bg-[#FF0055] text-white text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ml-auto shrink-0 inline-block text-center select-none shadow-none">
          SIN DATOS
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
      rolesPermitidos: ['ADMIN', 'GERENTE_BODEGA', 'VENDEDOR'],
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 012-2h2a2 2 0 012 2v1m-4 0h4m-6 7a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 3h3" />
        </svg>
      )
    },
    {
      label: 'Traslados de Stock',
      path: '/traslados',
      disabled: false,
      badge: null,
      rolesPermitidos: ['ADMIN', 'GERENTE_BODEGA', 'VENDEDOR'],
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      )
    },
    {
      label: 'Registro de Ventas',
      path: '/ventas',
      disabled: false,
      badge: null,
      rolesPermitidos: ['ADMIN', 'VENDEDOR'],
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 00-4zm-8 2a2 2 0 100 4 2 2 0 00-4z" />
        </svg>
      )
    },
    {
      label: 'Pre-Facturación',
      path: '/facturas',
      disabled: false,
      badge: null,
      rolesPermitidos: ['ADMIN', 'VENDEDOR', 'CONTABLE'],
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 01-2-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      )
    },
    {
      label: 'Conexiones E-Commerce',
      path: '/integraciones',
      disabled: true,
      rolesPermitidos: ['ADMIN'],
      badge: (
        <span className="bg-gray-800 text-gray-400 text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ml-auto shrink-0 inline-block text-center select-none shadow-none">
          PROX.
        </span>
      ),
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 005.656-5.656l-1.1 1.1" />
        </svg>
      )
    },
    {
      label: 'Portal Factura Electronica',
      path: 'Conexiones POS',
      disabled: true,
      rolesPermitidos: ['ADMIN'],
      badge: (
        <span className="bg-gray-800 text-gray-400 text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ml-auto shrink-0 inline-block text-center select-none shadow-none">
          PROX.
        </span>
      ),
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 005.656-5.656l-1.1 1.1" />
        </svg>
      )
    },
    {
      label: 'Manual & Glosario',
      path: '/glosario',
      disabled: false,
      badge: null,
      rolesPermitidos: ['ADMIN', 'GERENTE_BODEGA', 'VENDEDOR', 'CONTABLE'], // Accesible para todos
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      )
    },
  ];

  const menuVisibles = menuItems.filter(item => item.rolesPermitidos.includes(rolActual));

  if (loadingSession) {
    return (
      <html lang="es">
        <body className="bg-[#F4F5F7] min-h-screen flex items-center justify-center text-gray-700 font-sans">
          <div className="flex items-center gap-3 bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
            <div className="w-5 h-5 border-2 border-[#FFD800] border-t-[#222222] rounded-full animate-spin"></div>
            <span className="text-xs font-satoshi-black tracking-wider uppercase text-gray-900">Cargando LOBO STOCK...</span>
          </div>
        </body>
      </html>
    );
  }

  if (!userAuth) {
    return (
      <html lang="es">
        <body className="bg-[#222222] min-h-screen text-slate-100 antialiased font-sans select-none p-0 md:p-4 lg:p-6">
          <div className="w-full h-full min-h-[calc(100vh-2rem)] flex flex-col lg:flex-row rounded-none md:rounded-3xl overflow-hidden border border-gray-800 shadow-2xl bg-[#1C1C1C]">
            
            {/* LADO IZQUIERDO: LOBO STOCK BRANDING */}
            <div className="hidden lg:flex w-1/2 relative flex-col justify-between p-12 overflow-hidden bg-[#161616]">
              <div 
                className="absolute inset-0 bg-cover bg-center opacity-20 mix-blend-luminosity scale-105"
                style={{ backgroundImage: `url('https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?q=80&w=1600&auto=format&fit=crop')` }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#161616] via-[#161616]/80 to-transparent" />
              <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-[#FFD800]/10 rounded-full blur-3xl pointer-events-none" />

              <div className="relative z-10 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#FFD800] flex items-center justify-center font-black text-[#222222] text-xl shadow-lg shadow-[#FFD800]/20">
                  🐺
                </div>
                <div>
                  <span className="text-xl font-black tracking-wider text-white font-mono block leading-none">
                    LOBO <span className="text-[#FFD800]">STOCK</span>
                  </span>
                  <span className="text-[10px] text-gray-400 tracking-widest uppercase font-mono">
                    CONTROL DE INVENTARIOS OMNICANAL
                  </span>
                </div>
              </div>

              <div className="relative z-10 max-w-md space-y-6 my-auto">
                <div className="inline-flex items-center gap-2 bg-[#222222] border border-[#FFD800]/30 px-3.5 py-1.5 rounded-full backdrop-blur-md">
                  <span className="w-2 h-2 rounded-full bg-[#FFD800] animate-pulse" />
                  <span className="text-xs font-mono text-[#FFD800]">Sincronización Inteligente v2.0</span>
                </div>

                <h1 className="text-3xl lg:text-4xl font-black text-white tracking-tight leading-tight">
                  Lidera tu inventario y domina tus ventas en tiempo real.
                </h1>

                <p className="text-xs text-gray-300 leading-relaxed">
                  Centraliza bodegas físicas, puntos de venta (POS) y canales digitales conectando stock, traslados y facturación con total precisión.
                </p>

                <div className="bg-[#222222]/90 border border-gray-800 backdrop-blur-md p-4 rounded-2xl flex items-center justify-between text-xs space-x-4">
                  <div>
                    <span className="text-[10px] text-gray-400 block uppercase font-mono">Sincronización</span>
                    <span className="font-bold text-[#FFD800]">Omnicanal 100%</span>
                  </div>
                  <div className="h-8 w-px bg-gray-800" />
                  <div>
                    <span className="text-[10px] text-gray-400 block uppercase font-mono">Facturación</span>
                    <span className="font-bold text-white">DIAN Cumplimiento</span>
                  </div>
                  <div className="h-8 w-px bg-gray-800" />
                  <div>
                    <span className="text-[10px] text-gray-400 block uppercase font-mono">Inventario</span>
                    <span className="font-bold text-[#FFD800]">Multibodega</span>
                  </div>
                </div>
              </div>

              <div className="relative z-10 text-[10px] text-gray-500 font-mono">
                © 2026 LOBO STOCK · Todos los derechos reservados.
              </div>
            </div>

            {/* LADO DERECHO: FORMULARIO */}
            <div className="flex-1 flex flex-col justify-between p-6 sm:p-12 bg-[#1C1C1C] relative">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2 lg:hidden">
                  <div className="w-8 h-8 rounded-lg bg-[#FFD800] text-[#222222] font-black flex items-center justify-center text-sm">
                    🐺
                  </div>
                  <span className="font-bold text-sm text-white">LOBO STOCK</span>
                </div>

                <div className="flex items-center gap-3 ml-auto">
                  <a 
                    href="https://wa.me/573138712634?text=Hola,%20necesito%20soporte%20con%20LOBO%20STOCK"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-gray-300 hover:text-white flex items-center gap-2 bg-[#222222] hover:bg-[#2A2A2A] px-3.5 py-2 rounded-full border border-gray-800 transition shadow-md"
                  >
                    <svg className="w-4 h-4 text-[#FFD800]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="font-satoshi-black">Soporte</span>
                  </a>
                </div>
              </div>

              <div className="w-full max-w-md mx-auto space-y-6 my-auto py-8">
                <div className="text-center space-y-2">
                  <h2 className="text-2xl font-black text-white tracking-tight">
                    {isRegister ? 'Registro de Empresa' : 'Bienvenido a LOBO STOCK'}
                  </h2>
                  <p className="text-xs text-gray-400">
                    {isRegister
                      ? 'Crea tu cuenta corporativa para administrar bodegas y puntos de venta.'
                      : 'Ingresa la información de tu negocio para acceder a la plataforma.'}
                  </p>
                </div>

                <form onSubmit={handleLogin} className="space-y-5">

                  {isRegister && (
                    <>
                      <div className="relative border-b border-gray-800 focus-within:border-[#FFD800] transition-colors pb-1">
                        <label className="block text-[10px] font-mono text-gray-400 uppercase mb-1">
                          Nombre del Administrador / Empresa *
                        </label>
                        <div className="flex items-center">
                          <svg className="w-4 h-4 text-gray-500 mr-2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          <input
                            type="text"
                            required
                            value={nombreField}
                            onChange={(e) => setNombreField(e.target.value)}
                            placeholder="Leonardo Villamizar"
                            className="w-full bg-transparent text-xs text-white placeholder-gray-600 focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="relative border-b border-gray-800 focus-within:border-[#FFD800] transition-colors pb-1">
                        <label className="block text-[10px] font-mono text-gray-400 uppercase mb-1">
                          País & Número Celular / Teléfono *
                        </label>
                        <div className="flex items-center gap-2">
                          <select
                            value={indicativoField}
                            onChange={(e) => setIndicativoField(e.target.value)}
                            className="bg-[#222222] text-xs font-mono font-bold text-[#FFD800] rounded-lg p-1.5 border border-gray-800 focus:outline-none shrink-0 cursor-pointer"
                          >
                            {paisesLatam.map((p) => (
                              <option key={p.codigo} value={p.codigo} className="bg-[#222222] text-white">
                                {p.bandera} {p.codigo}
                              </option>
                            ))}
                          </select>

                          <input
                            type="text"
                            required
                            value={telefonoField}
                            onChange={(e) => setTelefonoField(e.target.value)}
                            placeholder="313 871 2634"
                            className="w-full bg-transparent text-xs text-white placeholder-gray-600 focus:outline-none font-mono"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="relative border-b border-gray-800 focus-within:border-[#FFD800] transition-colors pb-1">
                      <label className="block text-[10px] font-mono text-gray-400 uppercase mb-1">
                        Usuario / Correo
                      </label>
                      <div className="flex items-center">
                        <svg className="w-4 h-4 text-gray-500 mr-2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                        </svg>
                        <input
                          type="text"
                          required
                          value={userField}
                          onChange={(e) => setUserField(e.target.value)}
                          placeholder="admin@lobostock.com"
                          className="w-full bg-transparent text-xs text-white placeholder-gray-600 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="relative border-b border-gray-800 focus-within:border-[#FFD800] transition-colors pb-1">
                      <label className="block text-[10px] font-mono text-gray-400 uppercase mb-1">
                        Clave de Acceso
                      </label>
                      <div className="flex items-center">
                        <svg className="w-4 h-4 text-gray-500 mr-2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          value={passField}
                          onChange={(e) => setPassField(e.target.value)}
                          placeholder="••••••••••••"
                          className="w-full bg-transparent text-xs text-white placeholder-gray-600 focus:outline-none pr-6"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="text-gray-500 hover:text-[#FFD800] transition ml-1"
                        >
                          {showPassword ? (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3l18 18" />
                            </svg>
                          ) : (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {!isRegister && (
                    <div className="flex justify-between items-center text-[11px] pt-1">
                      <label className="flex items-center text-gray-400 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={remember}
                          onChange={(e) => setRemember(e.target.checked)}
                          className="rounded bg-[#222222] border-gray-800 text-[#FFD800] focus:ring-0 mr-2 w-3.5 h-3.5"
                        />
                        Recordar sesión
                      </label>
                      <button type="button" className="text-gray-400 hover:text-[#FFD800] transition font-medium underline underline-offset-2">
                        ¿Olvidaste tu clave?
                      </button>
                    </div>
                  )}

                  <div className="pt-4 space-y-3">
                    <button
                      type="submit"
                      disabled={loadingAction}
                      className="w-full bg-[#FFD800] hover:bg-[#FDCB13] text-[#222222] font-black py-3.5 rounded-full text-xs uppercase tracking-wider transition-all duration-300 shadow-lg shadow-[#FFD800]/10 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {loadingAction ? (
                        <span>{isRegister ? 'Registrando empresa...' : 'Iniciando sesión...'}</span>
                      ) : (
                        <>
                          <span>{isRegister ? 'REGISTRAR EMPRESA' : 'INICIAR SESIÓN'}</span>
                          <svg className="w-4 h-4 text-[#222222]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                          </svg>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsRegister(!isRegister)}
                      className="w-full bg-[#222222] hover:bg-[#2A2A2A] text-gray-300 border border-gray-800 font-bold py-3 rounded-full text-xs transition flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4 text-[#FFD800]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                      </svg>
                      <span>{isRegister ? '¿Ya tienes cuenta? Inicia Sesión' : 'Crear una cuenta nueva'}</span>
                    </button>
                  </div>

                </form>
              </div>

              <div className="flex flex-wrap items-center justify-between text-[10px] text-gray-500 pt-6 border-t border-gray-800 gap-2">
                <div className="flex gap-3">
                  <a href="#" className="hover:text-gray-300 transition">Términos de servicio</a>
                  <span>·</span>
                  <a href="#" className="hover:text-gray-300 transition">Políticas de privacidad</a>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>Conexión segura SSL</span>
                </div>
              </div>

            </div>

          </div>
        </body>
      </html>
    );
  }

  let pasocumplidoCount = 0;
  const pasoPerfilCompletado = !!(userAuth?.nombre && (userAuth?.telefono || userAuth?.num_doc));
  if (pasoPerfilCompletado) pasocumplidoCount++;

  const pasoSedesCompletado = !!(numSucursales && numSucursales > 0);
  if (pasoSedesCompletado) pasocumplidoCount++;

  const pasoEquipoCompletado = !!(numVendedores && numVendedores > 1);
  if (pasoEquipoCompletado) pasocumplidoCount++;

  const porcentajeProgreso = Math.round((pasocumplidoCount / 3) * 100);

  return (
    <html lang="es">
      <body className="bg-[#F4F5F7] text-gray-800 min-h-screen flex antialiased font-sans">

        {/* SIDEBAR FIJO Y ESTÁTICO (#222222 ANTRACITA) */}
        <aside className="w-64 bg-[#222222] text-white h-screen sticky top-0 flex flex-col justify-between p-4 shadow-md shrink-0 border-r border-gray-800 overflow-hidden">
          <div className="flex flex-col flex-1 overflow-hidden">
            
            {/* HEADER LOGO (FIJO ARRIBA) */}
            <div className="p-3 border-b border-gray-800 mb-4 flex items-center gap-3 shrink-0">
              <div className="w-9 h-9 rounded-xl bg-[#FFD800] flex items-center justify-center font-satoshi-black text-[#222222] text-lg shadow-sm">
                🐺
              </div>
              <div className="truncate">
                <div className="text-sm font-black text-white truncate tracking-wide font-mono">
                  LOBO <span className="text-[#FFD800]">STOCK</span>
                </div>
                <div className="text-[10px] text-[#FFD800] font-satoshi-black uppercase tracking-wider">
                  {rolActual === 'ADMIN' ? 'ADMINISTRADOR (ADM)' : `ROL: ${rolActual}`}
                </div>
              </div>
            </div>

            {/* NAVEGACIÓN (CON SCROLL INTERNO SI ES NECESARIO) */}
            <nav className="space-y-1 flex-1 overflow-y-auto pr-1">
              {menuVisibles.map((item) => {
                const isActive = pathname === item.path;

                if (item.disabled) {
                  return (
                    <div key={item.path} className="relative">
                      <button
                        type="button"
                        onClick={() => setShowEcommerceTooltip(!showEcommerceTooltip)}
                        className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-satoshi-regular text-gray-500 hover:text-gray-400 cursor-not-allowed transition-all opacity-70"
                      >
                        <div className="flex items-center gap-3 truncate">
                          <span className="text-gray-500">{item.icon}</span>
                          <span className="truncate">{item.label}</span>
                        </div>
                        {item.badge}
                      </button>

                      {showEcommerceTooltip && (
                        <div className="absolute left-full top-0 ml-2 w-48 bg-white border border-gray-200 text-gray-800 text-[11px] p-2.5 rounded-xl shadow-2xl z-50 animate-in fade-in">
                          <p className="font-satoshi-black text-gray-900 mb-0.5">Próximamente</p>
                          <p className="font-satoshi-regular text-gray-600">Esta función estará disponible muy pronto para vincular tus tiendas.</p>
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
                        ? 'bg-[#FFD800] text-[#222222] font-satoshi-black shadow-sm font-bold'
                        : 'text-gray-400 hover:text-white hover:bg-white/5 font-satoshi-regular'
                    }`}
                  >
                    <div className="flex items-center gap-3 truncate">
                      <span className={isActive ? 'text-[#222222]' : 'text-gray-400'}>{item.icon}</span>
                      <span className="truncate">{item.label}</span>
                    </div>
                    {item.badge}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* TARJETA DE PERFIL FIJA EN LA PARTE INFERIOR */}
          <div className="relative pt-4 border-t border-gray-800 shrink-0" ref={popoverRef}>
            <button
              type="button"
              onClick={() => setShowUserPopover(!showUserPopover)}
              className="w-full flex items-center justify-between p-2.5 rounded-xl bg-[#2A2A2A] hover:bg-[#333333] border border-gray-800 transition cursor-pointer"
            >
              <div className="flex items-center gap-2.5 truncate">
                <div className="w-7 h-7 rounded-lg bg-[#FFD800] text-[#222222] font-satoshi-black text-xs flex items-center justify-center font-bold shrink-0">
                  {userAuth?.nombre ? userAuth.nombre.charAt(0).toUpperCase() : 'U'}
                </div>
                <div className="truncate text-left">
                  <div className="text-xs font-satoshi-black text-white truncate">{userAuth?.nombre || 'ATOM SOLUTIONS DATA'}</div>
                  <div className="text-[9px] text-[#FFD800] font-satoshi-black uppercase">
                    {rolActual === 'ADMIN' ? 'ADMINISTRADOR (ADM)' : rolActual}
                  </div>
                </div>
              </div>

              <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${showUserPopover ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
              </svg>
            </button>

            {showUserPopover && (
              <div className="absolute bottom-16 left-0 right-0 bg-[#2A2A2A] border border-gray-800 rounded-2xl p-3 shadow-2xl z-50 space-y-2 animate-in fade-in">
                <div className="p-2 border-b border-gray-800">
                  <p className="text-[10px] font-satoshi-black text-gray-400 uppercase">Cuenta de Acceso</p>
                  <p className="text-xs font-satoshi-regular text-white truncate">{userAuth?.user}</p>
                </div>

                <Link
                  href="/perfil"
                  onClick={() => setShowUserPopover(false)}
                  className="flex items-center gap-2.5 w-full p-2 text-xs font-satoshi-black text-gray-200 hover:bg-[#222222] hover:text-[#FFD800] rounded-xl transition"
                >
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              
              <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm relative overflow-hidden">
                <h1 className="text-3xl font-black text-gray-900 font-satoshi-black tracking-tight">
                  ¡Bienvenido a LOBO STOCK, {userAuth?.nombre}! 🚀
                </h1>
                <p className="text-xs text-gray-500 mt-1 font-satoshi-regular max-w-xl">
                  Para habilitar el 100% de la plataforma y el punto de venta, completa la configuración inicial de tu empresa:
                </p>

                <div className="mt-6 pt-4 border-t border-gray-100 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-satoshi-black text-gray-900 uppercase tracking-wider">
                      Progreso de Configuración Inicial
                    </span>
                    <span className="font-satoshi-black text-[#222222] font-mono text-sm font-bold">
                      {porcentajeProgreso}% COMPLETADO
                    </span>
                  </div>
                  <div className="w-full h-3.5 bg-gray-100 rounded-full overflow-hidden p-0.5 border border-gray-200">
                    <div
                      className="h-full rounded-full bg-[#FFD800] transition-all duration-500"
                      style={{ width: `${Math.max(porcentajeProgreso, 5)}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex justify-between items-start mb-3">
                      <span className="w-8 h-8 rounded-xl bg-gray-100 text-[#222222] font-satoshi-black flex items-center justify-center text-xs font-bold">
                        1
                      </span>
                      <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                        pasoPerfilCompletado ? 'bg-emerald-100 text-emerald-800' : 'bg-[#FF0055] text-white'
                      }`}>
                        {pasoPerfilCompletado ? '✓ COMPLETADO' : '! REQUERIDO'}
                      </span>
                    </div>
                    <h3 className="font-satoshi-black text-base text-gray-900 uppercase tracking-wide">
                      Datos Personales & Celular
                    </h3>
                    <p className="text-xs text-gray-500 font-satoshi-regular mt-1 leading-relaxed">
                      Ingresa tu número de celular, NIT y datos del administrador para la facturación.
                    </p>
                  </div>

                  <Link
                    href="/perfil"
                    className="w-full bg-[#FFD800] hover:bg-[#FDCB13] text-[#222222] font-satoshi-black py-3 rounded-xl text-xs uppercase tracking-wider transition-colors shadow-sm text-center flex items-center justify-center gap-1.5"
                  >
                    <span>{pasoPerfilCompletado ? 'Ver Datos' : 'Actualizar Perfil'}</span>
                  </Link>
                </div>

                <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex justify-between items-start mb-3">
                      <span className="w-8 h-8 rounded-xl bg-gray-100 text-[#222222] font-satoshi-black flex items-center justify-center text-xs font-bold">
                        2
                      </span>
                      <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                        pasoSedesCompletado ? 'bg-emerald-100 text-emerald-800' : 'bg-[#FF0055] text-white'
                      }`}>
                        {pasoSedesCompletado ? '✓ COMPLETADO' : '! REQUERIDO'}
                      </span>
                    </div>
                    <h3 className="font-satoshi-black text-base text-gray-900 uppercase tracking-wide">
                      Crear Primera Sede
                    </h3>
                    <p className="text-xs text-gray-500 font-satoshi-regular mt-1 leading-relaxed">
                      Registra tu punto de venta o bodega física con su dirección real.
                    </p>
                  </div>

                  <Link
                    href="/sucursales"
                    className="w-full bg-[#222222] hover:bg-[#333333] text-white font-satoshi-black py-3 rounded-xl text-xs uppercase tracking-wider transition-colors shadow-sm text-center flex items-center justify-center gap-1.5"
                  >
                    <span>{pasoSedesCompletado ? 'Gestionar Sedes' : '+ Crear Sede Real'}</span>
                  </Link>
                </div>

                <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex justify-between items-start mb-3">
                      <span className="w-8 h-8 rounded-xl bg-gray-100 text-[#222222] font-satoshi-black flex items-center justify-center text-xs font-bold">
                        3
                      </span>
                      <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                        pasoEquipoCompletado ? 'bg-emerald-100 text-emerald-800' : 'bg-[#FF0055] text-white'
                      }`}>
                        {pasoEquipoCompletado ? '✓ COMPLETADO' : '! REQUERIDO'}
                      </span>
                    </div>
                    <h3 className="font-satoshi-black text-base text-gray-900 uppercase tracking-wide">
                      Equipo & Vendedores
                    </h3>
                    <p className="text-xs text-gray-500 font-satoshi-regular mt-1 leading-relaxed">
                      Añade cajeros o administradores asignados para la operación diaria de tu negocio.
                    </p>
                  </div>

                  <Link
                    href="/vendedores"
                    className="w-full bg-gray-100 hover:bg-gray-200 text-gray-900 border border-gray-300 font-satoshi-black py-3 rounded-xl text-xs uppercase tracking-wider transition-colors text-center"
                  >
                    <span>{pasoEquipoCompletado ? 'Ver Equipo' : '+ Añadir Vendedor'}</span>
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
