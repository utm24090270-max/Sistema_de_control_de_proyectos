import React, { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, UserPlus, LogIn, Eye, EyeOff, Building2, FileText, MapPin } from 'lucide-react';
import logo from '../assets/logo.jpeg';

export default function Login() {
  const [modo, setModo] = useState('LOGIN'); // 'LOGIN' o 'REGISTRO'

  // Estado para visibilidad de contraseña
  const [mostrarPassword, setMostrarPassword] = useState(false);

  // Campos de Iniciar Sesión
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Campos de Registro (Cliente)
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [telefono, setTelefono] = useState('');
  const [curp, setCurp] = useState('');
  const [rfc, setRfc] = useState('');
  const [direccion, setDireccion] = useState('');
  const [tipoConstruccion, setTipoConstruccion] = useState('Residencial');
  const [institucionFinanciera, setInstitucionFinanciera] = useState('datos sin asignar');

  const [error, setError] = useState('');
  const [mensajeExito, setMensajeExito] = useState('');

  const { login, registro } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
      navigate('/expedientes');
    } catch (err) {
      setError(err.response?.data?.error || 'Error al iniciar sesión. Revisa tus credenciales.');
    }
  };

  const handleRegistroSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMensajeExito('');
    try {
      await registro({
        nombre,
        apellido,
        email,
        password,
        telefono,
        curp,
        rfc,
        direccion,
        tipo_construccion: tipoConstruccion
      });

      setMensajeExito('¡Cuenta y expediente creados con éxito! Ahora puedes iniciar sesión.');
      setModo('LOGIN');
      setPassword('');
      setMostrarPassword(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al registrar la cuenta.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4 py-8">
      <div className="max-w-md w-full bg-white rounded-xl shadow-2xl p-8 space-y-6">
        
        {/* LOGO Y ENCABEZADO */}
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-2">
            <img 
              src={logo} 
              alt="Constructora Proyecto 20" 
              className="h-20 object-contain" 
            />
          </div>
          <h2 className="text-xl font-bold text-gray-800">
            {modo === 'LOGIN' ? 'Iniciar Sesión' : 'Registro de Cliente'}
          </h2>
          <p className="text-sm text-gray-500 font-medium">
            Portal Digital de Gestión Inmobiliaria
          </p>
        </div>

        {/* MENSAJES DE ERROR O ÉXITO */}
        {mensajeExito && (
          <div className="bg-green-50 border-l-4 border-green-500 text-green-700 p-3 rounded text-sm">
            {mensajeExito}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-3 rounded text-sm">
            {error}
          </div>
        )}

        {modo === 'LOGIN' ? (
          /* FORMULARIO ÚNICO DE LOGIN */
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Correo Electrónico
              </label>
              <div className="relative mt-1">
                <Mail className="w-5 h-5 text-gray-400 absolute left-3 top-3" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
                  placeholder="ejemplo@correo.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Contraseña</label>
              <div className="relative mt-1">
                <Lock className="w-5 h-5 text-gray-400 absolute left-3 top-3" />
                <input
                  type={mostrarPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10 w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setMostrarPassword(!mostrarPassword)}
                  className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 focus:outline-none"
                  title={mostrarPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {mostrarPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition duration-200 shadow-md flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogIn className="w-4 h-4" /> Iniciar Sesión
            </button>

            {/* ENLACE PARA NAVEGAR A CREAR CUENTA */}
            <div className="text-center pt-3 border-t border-gray-100 mt-4">
              <p className="text-xs text-gray-600">
                ¿Aún no tienes una cuenta?{' '}
                <button
                  type="button"
                  onClick={() => { setModo('REGISTRO'); setError(''); setMensajeExito(''); setMostrarPassword(false); }}
                  className="text-blue-600 hover:underline font-bold cursor-pointer"
                >
                  Regístrate aquí
                </button>
              </p>
            </div>
          </form>
        ) : (
          /* FORMULARIO DE REGISTRO DE CLIENTES */
          <form onSubmit={handleRegistroSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-700">Nombre</label>
                <input
                  type="text"
                  required
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full px-3 py-1.5 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="Juan"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">Apellido</label>
                <input
                  type="text"
                  required
                  value={apellido}
                  onChange={(e) => setApellido(e.target.value)}
                  className="w-full px-3 py-1.5 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="Pérez"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-700">Teléfono</label>
                <input
                  type="tel"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  className="w-full px-3 py-1.5 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="4491234567"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">CURP</label>
                <input
                  type="text"
                  value={curp}
                  onChange={(e) => setCurp(e.target.value.toUpperCase())}
                  className="w-full px-3 py-1.5 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="CURP"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-700">RFC</label>
                <div className="relative mt-0.5">
                  <FileText className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={rfc}
                    onChange={(e) => setRfc(e.target.value.toUpperCase())}
                    className="pl-8 w-full px-3 py-1.5 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                    placeholder="RFC"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">
                  Tipo de Construcción <span className="text-red-500">*</span>
                </label>
                <div className="relative mt-0.5">
                  <Building2 className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
                  <select
                    required
                    value={tipoConstruccion}
                    onChange={(e) => setTipoConstruccion(e.target.value)}
                    className="pl-8 w-full px-3 py-1.5 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm bg-white cursor-pointer"
                  >
                    <option value="Residencial">Residencial</option>
                    <option value="Comercial">Comercial</option>
                    <option value="Industrial">Industrial</option>
                    <option value="Infraestructura">Infraestructura</option>
                    <option value="Mixto">Mixto</option>
                  </select>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700">Dirección Completa</label>
              <div className="relative mt-0.5">
                <MapPin className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={direccion}
                  onChange={(e) => setDireccion(e.target.value)}
                  className="pl-8 w-full px-3 py-1.5 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="Calle, número, colonia, C.P."
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700">Correo Electrónico</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-1.5 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                placeholder="cliente@ejemplo.com"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700">Contraseña</label>
              <div className="relative mt-0.5">
                <input
                  type={mostrarPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10 w-full px-3 py-1.5 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setMostrarPassword(!mostrarPassword)}
                  className="absolute right-3 top-2 text-gray-400 hover:text-gray-600 focus:outline-none"
                  title={mostrarPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {mostrarPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 rounded-lg transition duration-200 shadow-md flex items-center justify-center gap-2 mt-2 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" /> Registrarme y Crear Expediente
            </button>

            {/* ENLACE PARA VOLVER AL LOGIN */}
            <div className="text-center pt-2 border-t border-gray-100 mt-3">
              <p className="text-xs text-gray-600">
                ¿Ya tienes una cuenta?{' '}
                <button
                  type="button"
                  onClick={() => { setModo('LOGIN'); setError(''); setMensajeExito(''); setMostrarPassword(false); }}
                  className="text-blue-600 hover:underline font-bold cursor-pointer"
                >
                  Inicia sesión aquí
                </button>
              </p>
            </div>
          </form>
        )}

      </div>
    </div>
  );
}