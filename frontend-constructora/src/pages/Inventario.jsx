import { useEffect, useMemo, useState, useContext } from 'react';
import api from '../api/axios';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  Building,
  Building2,
  LayoutGrid,
  MapPin,
  PlusCircle,
  Search,
  X,
  CheckCircle2,
  XCircle,
  ClipboardList,
  ShieldAlert,
  UserCheck,
  LogOut,
  ArrowLeft,
  UserCircle,
  AlertCircle,
  Eye,
  Save,
  Link2,
  Unlink,
  Send,
  Home,
  FileText,
  Upload,
  Download,
  History
} from 'lucide-react';
import logo from '../assets/logo.jpeg';

// ------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------
const ROLES_ADMIN = ['ADMIN', 'ADMINISTRADOR'];

const msgError = (e) => e?.response?.data?.error || 'Ocurrió un error inesperado. Intenta de nuevo.';

const formatoNum = (v, ancho = 2) => {
  const t = String(v ?? '').trim();
  return /^\d+$/.test(t) ? t.padStart(ancho, '0') : t.toUpperCase();
};

const ubicacion = (l) =>
  [l.fraccionamiento, l.condominio, l.num_manzana ? `Mz ${l.num_manzana}` : null].filter(Boolean).join(' › ');

const moneda = (n) =>
  n === null || n === undefined ? '—' : Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

const fechaCorta = (f) =>
  f ? new Date(f).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

const COLOR_LOTE = {
  DISPONIBLE: 'bg-emerald-100 text-emerald-800',
  ASIGNADO: 'bg-amber-100 text-amber-800',
  RESERVADO: 'bg-blue-100 text-blue-800',
  VENDIDO: 'bg-gray-200 text-gray-700'
};
const COLOR_SOLICITUD = {
  PENDIENTE: 'bg-amber-100 text-amber-800',
  APROBADA: 'bg-emerald-100 text-emerald-800',
  RECHAZADA: 'bg-red-100 text-red-700',
  CANCELADA: 'bg-gray-200 text-gray-700'
};

const Badge = ({ texto, mapa }) => (
  <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${mapa[texto] || 'bg-gray-100 text-gray-700'}`}>
    {texto}
  </span>
);

const Campo = ({ label, children, ayuda }) => (
  <label className="block">
    <span className="block text-xs font-bold text-gray-700 mb-1">{label}</span>
    {children}
    {ayuda && <span className="block text-[11px] text-gray-400 mt-1">{ayuda}</span>}
  </label>
);

const inputCls =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 bg-white';

const Modal = ({ titulo, subtitulo, onClose, children, ancho = 'max-w-lg' }) => (
  <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
    <div className={`bg-white rounded-2xl shadow-2xl w-full ${ancho} max-h-[90vh] overflow-y-auto p-6`}>
      <div className="flex justify-between items-start mb-4 border-b border-gray-200 pb-3">
        <div>
          <h3 className="text-lg font-bold text-gray-900">{titulo}</h3>
          {subtitulo && <p className="text-xs text-gray-500 mt-0.5">{subtitulo}</p>}
        </div>
        <button type="button" onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 cursor-pointer">
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>
      {children}
    </div>
  </div>
);

// ------------------------------------------------------------
// Formulario de alta (fraccionamiento / condominio / manzana / lote)
// ------------------------------------------------------------
function FormularioAlta({ tipo, estructura, onClose, onGuardado }) {
  const [datos, setDatos] = useState({
    id_fraccionamiento: '', id_condominio: '', id_manzana: '',
    nombre: '', descripcion: '', num_manzana: '', num_lote: '', m2: '', precio: ''
  });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const set = (campo, valor) => setDatos((d) => ({ ...d, [campo]: valor }));

  const condominiosDe = estructura.condominios.filter(
    (c) => String(c.id_fraccionamiento) === String(datos.id_fraccionamiento)
  );
  // Manzanas de la ubicación elegida (solo las que pertenecen exactamente a esa ubicación)
  const manzanasDe = estructura.manzanas.filter(
    (m) =>
      String(m.id_fraccionamiento) === String(datos.id_fraccionamiento) &&
      String(m.id_condominio ?? '') === String(datos.id_condominio ?? '')
  );

  const siglasFracc = estructura.fraccionamientos.find((f) => String(f.id_fraccionamiento) === String(datos.id_fraccionamiento))?.siglas;
  const siglasCondo = condominiosDe.find((c) => String(c.id_condominio) === String(datos.id_condominio))?.siglas;
  const manzanaSel = manzanasDe.find((m) => String(m.id_manzana) === String(datos.id_manzana));
  const previa =
    tipo === 'lote' && (siglasCondo || siglasFracc) && manzanaSel && datos.num_lote.trim()
      ? `${siglasCondo || siglasFracc}-M-${formatoNum(manzanaSel.num_manzana)}-L-${formatoNum(datos.num_lote)}`
      : null;

  const titulos = {
    fraccionamiento: 'Nuevo fraccionamiento',
    condominio: 'Nuevo condominio',
    manzana: 'Nueva manzana',
    lote: 'Nuevo lote'
  };

  const validar = () => {
    if (tipo === 'fraccionamiento' && !datos.nombre.trim()) return 'El nombre del fraccionamiento es obligatorio.';
    if (tipo === 'condominio') {
      if (!datos.id_fraccionamiento) return 'Debes seleccionar un fraccionamiento para registrar el condominio.';
      if (!datos.nombre.trim()) return 'El nombre del condominio es obligatorio.';
    }
    if (tipo === 'manzana') {
      if (!datos.id_fraccionamiento) return 'Debes seleccionar un fraccionamiento.';
      if (!datos.num_manzana.trim()) return 'El número de manzana es obligatorio.';
    }
    if (tipo === 'lote') {
      if (!datos.id_fraccionamiento) return 'Debes seleccionar un fraccionamiento.';
      if (!datos.id_manzana) return 'Debes seleccionar una manzana.';
      if (!datos.num_lote.trim()) return 'El número de lote es obligatorio.';
      if (!(Number(datos.m2) > 0)) return 'Los m² deben ser un número mayor a 0.';
      if (datos.precio === '' || Number(datos.precio) < 0) return 'El precio debe ser un número igual o mayor a 0.';
    }
    return '';
  };

  const guardar = async (e) => {
    e.preventDefault();
    const problema = validar();
    if (problema) return setError(problema);
    setError('');
    setGuardando(true);
    try {
      if (tipo === 'fraccionamiento') {
        await api.post('/inventario/fraccionamientos', { nombre: datos.nombre, descripcion: datos.descripcion });
      } else if (tipo === 'condominio') {
        await api.post('/inventario/condominios', { id_fraccionamiento: datos.id_fraccionamiento, nombre: datos.nombre });
      } else if (tipo === 'manzana') {
        await api.post('/inventario/manzanas', {
          id_fraccionamiento: datos.id_fraccionamiento,
          id_condominio: datos.id_condominio || null,
          num_manzana: datos.num_manzana
        });
      } else {
        await api.post('/inventario/lotes', {
          id_fraccionamiento: datos.id_fraccionamiento,
          id_condominio: datos.id_condominio || null,
          id_manzana: datos.id_manzana,
          num_lote: datos.num_lote,
          m2: datos.m2,
          precio: datos.precio
        });
      }
      onGuardado(`${titulos[tipo].replace('Nuevo ', '').replace('Nueva ', '')} registrado correctamente.`);
    } catch (err) {
      setError(msgError(err));
    } finally {
      setGuardando(false);
    }
  };

  const selectorFracc = (
    <Campo label="Fraccionamiento *">
      <select
        className={inputCls}
        value={datos.id_fraccionamiento}
        onChange={(e) => setDatos((d) => ({ ...d, id_fraccionamiento: e.target.value, id_condominio: '', id_manzana: '' }))}
      >
        <option value="">Selecciona un fraccionamiento</option>
        {estructura.fraccionamientos.map((f) => (
          <option key={f.id_fraccionamiento} value={f.id_fraccionamiento}>{f.nombre} ({f.siglas})</option>
        ))}
      </select>
    </Campo>
  );

  const selectorCondo = (
    <Campo label="Condominio" ayuda="Déjalo en “Sin condominio” si va directo al fraccionamiento.">
      <select
        className={inputCls}
        value={datos.id_condominio}
        disabled={!datos.id_fraccionamiento}
        onChange={(e) => setDatos((d) => ({ ...d, id_condominio: e.target.value, id_manzana: '' }))}
      >
        <option value="">Sin condominio</option>
        {condominiosDe.map((c) => (
          <option key={c.id_condominio} value={c.id_condominio}>{c.nombre} ({c.siglas})</option>
        ))}
      </select>
    </Campo>
  );

  return (
    <Modal titulo={titulos[tipo]} onClose={onClose}>
      <form onSubmit={guardar} className="space-y-4">
        {tipo === 'fraccionamiento' && (
          <>
            <Campo label="Nombre del fraccionamiento *" ayuda="Su identificador de dos letras se obtiene del nombre (Las Palmas → LP).">
              <input className={inputCls} value={datos.nombre} onChange={(e) => set('nombre', e.target.value)} maxLength={150} />
            </Campo>
            <Campo label="Descripción">
              <textarea className={inputCls} rows={3} value={datos.descripcion} onChange={(e) => set('descripcion', e.target.value)} />
            </Campo>
          </>
        )}

        {tipo === 'condominio' && (
          <>
            {selectorFracc}
            <Campo label="Nombre del condominio *" ayuda="Su identificador de dos letras se obtiene del nombre (Los Encinos → LE).">
              <input className={inputCls} value={datos.nombre} onChange={(e) => set('nombre', e.target.value)} maxLength={150} />
            </Campo>
          </>
        )}

        {tipo === 'manzana' && (
          <>
            {selectorFracc}
            {selectorCondo}
            <Campo label="Número de manzana *" ayuda={datos.num_manzana.trim() ? `Se registrará como M-${formatoNum(datos.num_manzana)}` : 'Ejemplo: 05'}>
              <input className={inputCls} value={datos.num_manzana} onChange={(e) => set('num_manzana', e.target.value)} maxLength={50} />
            </Campo>
          </>
        )}

        {tipo === 'lote' && (
          <>
            {selectorFracc}
            {selectorCondo}
            <Campo label="Manzana *">
              <select
                className={inputCls}
                value={datos.id_manzana}
                disabled={!datos.id_fraccionamiento}
                onChange={(e) => set('id_manzana', e.target.value)}
              >
                <option value="">{manzanasDe.length ? 'Selecciona una manzana' : 'No hay manzanas en esta ubicación'}</option>
                {manzanasDe.map((m) => (
                  <option key={m.id_manzana} value={m.id_manzana}>M-{formatoNum(m.num_manzana)}</option>
                ))}
              </select>
            </Campo>
            <div className="grid grid-cols-3 gap-3">
              <Campo label="Número de lote *">
                <input className={inputCls} value={datos.num_lote} onChange={(e) => set('num_lote', e.target.value)} maxLength={50} />
              </Campo>
              <Campo label="m² *">
                <input className={inputCls} type="number" min="0" step="0.01" value={datos.m2} onChange={(e) => set('m2', e.target.value)} />
              </Campo>
              <Campo label="Precio *">
                <input className={inputCls} type="number" min="0" step="0.01" value={datos.precio} onChange={(e) => set('precio', e.target.value)} />
              </Campo>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-600">
              Código de inventario (se genera automáticamente):{' '}
              <span className="font-bold text-slate-900">{previa || '—'}</span>
            </div>
          </>
        )}

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-lg px-3 py-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
          <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={guardando}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 text-xs font-bold rounded-lg shadow-md disabled:opacity-50 flex items-center gap-2 cursor-pointer"
          >
            <Save className="w-4 h-4" /> {guardando ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------
// Documentos de un elemento del inventario (fraccionamiento / condominio / lote)
// ------------------------------------------------------------
const MAX_DOC_MB = 10;
const TOTAL_DOCS = 3; // cada nivel tiene 3 documentos definidos

const tamanoLegible = (b) =>
  b === null || b === undefined ? '' : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;

function PanelDocumentos({ nivel, idElemento, titulo, subtitulo, onCambio }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');
  const [subiendo, setSubiendo] = useState('');
  const [historialAbierto, setHistorialAbierto] = useState('');

  const cargarDocs = async () => {
    try {
      const r = await api.get('/inventario/documentos', { params: { nivel, id: idElemento } });
      setDatos(r.data);
      setError('');
    } catch (e) {
      setDatos(null);
      setError(msgError(e));
    }
  };

  useEffect(() => {
    setDatos(null);
    setExito('');
    cargarDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nivel, idElemento]);

  // El archivo se pide con el token (encabezado) y se abre/descarga como blob: nunca hay una URL pública
  const abrirArchivo = async (doc, descargar) => {
    const ventana = descargar ? null : window.open('', '_blank');
    try {
      const r = await api.get(`/inventario/documentos/${doc.id_documento}/archivo`, {
        responseType: 'blob',
        params: descargar ? { descargar: 1 } : {}
      });
      const url = URL.createObjectURL(r.data);
      if (descargar) {
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.nombre_archivo;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      } else if (ventana) {
        ventana.location.href = url;
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    } catch (e) {
      if (ventana) ventana.close();
      setError('No se pudo abrir el archivo. Puede que ya no esté disponible en el servidor.');
    }
  };

  const subir = async (tipo, archivo) => {
    if (!archivo) return;
    setError('');
    setExito('');
    const ext = archivo.name.toLowerCase().split('.').pop();
    if (!['pdf', 'jpg', 'jpeg', 'png'].includes(ext)) return setError('Formato no permitido. Usa PDF, JPG o PNG.');
    if (archivo.size > MAX_DOC_MB * 1024 * 1024) return setError(`El archivo excede el máximo de ${MAX_DOC_MB} MB.`);

    const fd = new FormData();
    fd.append('nivel', nivel);
    fd.append('id_elemento', idElemento);
    fd.append('tipo_documento', tipo);
    fd.append('archivo', archivo);

    setSubiendo(tipo);
    try {
      const r = await api.post('/inventario/documentos', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setExito(r.data?.mensaje || 'Documento cargado correctamente.');
      await cargarDocs();
      if (onCambio) onCambio();
    } catch (e) {
      setError(msgError(e));
    } finally {
      setSubiendo('');
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex flex-wrap justify-between items-center gap-2">
        <div>
          <h3 className="font-bold text-gray-800 text-sm">{titulo}</h3>
          {subtitulo && <p className="text-xs text-gray-500">{subtitulo}</p>}
        </div>
        {datos && (
          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${datos.cargados === datos.total ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
            {datos.cargados} de {datos.total} cargados
          </span>
        )}
      </div>

      <div className="p-4 space-y-3">
        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-lg px-3 py-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {error}
          </div>
        )}
        {exito && <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-lg px-3 py-2">{exito}</div>}
        {!datos && !error && <p className="text-xs text-gray-400">Cargando documentos...</p>}

        {datos?.tipos.map((t) => {
          const idInput = `doc-${nivel}-${idElemento}-${t.tipo_documento}`;
          const cargado = t.estado === 'CARGADO';
          return (
            <div key={t.tipo_documento} className="border border-gray-100 rounded-lg px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <FileText className={`w-4 h-4 ${cargado ? 'text-emerald-600' : 'text-gray-300'}`} />
                    <span className="font-semibold text-sm text-gray-800">{t.etiqueta}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${cargado ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-500'}`}>
                      {cargado ? 'Cargado' : 'Pendiente'}
                    </span>
                  </div>
                  {cargado && (
                    <p className="text-[11px] text-gray-500 mt-1 break-all">
                      {t.documento.nombre_archivo}
                      {t.documento.tamano_bytes ? ` · ${tamanoLegible(t.documento.tamano_bytes)}` : ''}
                      {' · '}Cargado el {fechaCorta(t.documento.fecha_carga)}
                      {t.documento.cargado_por ? ` por ${t.documento.cargado_por}` : ''}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {cargado && (
                    <>
                      <button type="button" onClick={() => abrirArchivo(t.documento, false)} className="text-xs font-bold text-gray-700 hover:bg-gray-100 px-2.5 py-1.5 rounded-lg border border-gray-200 flex items-center gap-1 cursor-pointer">
                        <Eye className="w-3.5 h-3.5" /> Ver
                      </button>
                      <button type="button" onClick={() => abrirArchivo(t.documento, true)} className="text-xs font-bold text-gray-700 hover:bg-gray-100 px-2.5 py-1.5 rounded-lg border border-gray-200 flex items-center gap-1 cursor-pointer">
                        <Download className="w-3.5 h-3.5" /> Descargar
                      </button>
                    </>
                  )}
                  <input
                    id={idInput}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    className="hidden"
                    onChange={(e) => { subir(t.tipo_documento, e.target.files[0]); e.target.value = ''; }}
                  />
                  <label
                    htmlFor={idInput}
                    className={`text-xs font-bold text-blue-700 hover:bg-blue-50 px-2.5 py-1.5 rounded-lg border border-blue-200 flex items-center gap-1 cursor-pointer ${subiendo === t.tipo_documento ? 'opacity-50 pointer-events-none' : ''}`}
                  >
                    <Upload className="w-3.5 h-3.5" /> {subiendo === t.tipo_documento ? 'Subiendo...' : cargado ? 'Reemplazar' : 'Cargar'}
                  </label>
                </div>
              </div>

              {t.versiones_anteriores.length > 0 && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => setHistorialAbierto(historialAbierto === t.tipo_documento ? '' : t.tipo_documento)}
                    className="text-[11px] font-bold text-gray-500 hover:text-gray-800 flex items-center gap-1 cursor-pointer"
                  >
                    <History className="w-3.5 h-3.5" /> Versiones anteriores ({t.versiones_anteriores.length})
                  </button>
                  {historialAbierto === t.tipo_documento && (
                    <ul className="mt-2 space-y-1">
                      {t.versiones_anteriores.map((v) => (
                        <li key={v.id_documento} className="text-[11px] text-gray-500 flex flex-wrap items-center justify-between gap-2 bg-gray-50 rounded px-3 py-1.5">
                          <span className="break-all">
                            {v.nombre_archivo} · cargado el {fechaCorta(v.fecha_carga)} · reemplazado el {fechaCorta(v.reemplazado_en)}
                          </span>
                          <button type="button" onClick={() => abrirArchivo(v, true)} className="font-bold text-blue-700 hover:underline cursor-pointer">Descargar</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <p className="text-[11px] text-gray-400">Formatos: PDF, JPG o PNG · máximo {MAX_DOC_MB} MB. Cargar un archivo no implica que haya sido revisado o aprobado.</p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Página principal
// ------------------------------------------------------------
export default function Inventario() {
  const { usuario, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const rol = usuario?.rol?.toUpperCase();
  const esAdmin = ROLES_ADMIN.includes(rol);
  const esAsesor = rol === 'ASESOR';
  const nombreUsuario = (usuario?.nombre_completo || usuario?.nombre || '').trim();

  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState(null); // { tipo: 'ok' | 'error', texto }
  const [pestana, setPestana] = useState('inventario');

  const [estructura, setEstructura] = useState({ fraccionamientos: [], condominios: [], manzanas: [] });
  const [lotes, setLotes] = useState([]);
  const [solicitudes, setSolicitudes] = useState([]);
  const [expedientes, setExpedientes] = useState([]);
  const [resumenDocs, setResumenDocs] = useState({});
  const [docSel, setDocSel] = useState({ fracc: '', condo: '', manzana: '', lote: '' });

  // Filtros (admin)
  const [fFracc, setFFracc] = useState('');
  const [fCondo, setFCondo] = useState('');
  const [fManzana, setFManzana] = useState('');
  const [fEstado, setFEstado] = useState('');
  const [fBusca, setFBusca] = useState('');
  const [fEstadoSol, setFEstadoSol] = useState('PENDIENTE');

  // Modales
  const [formTipo, setFormTipo] = useState(null);
  const [loteAsignar, setLoteAsignar] = useState(null);
  const [idExpedienteSel, setIdExpedienteSel] = useState('');
  const [solicitudDetalle, setSolicitudDetalle] = useState(null);
  const [motivo, setMotivo] = useState('');
  const [loteSolicitar, setLoteSolicitar] = useState(null);
  const [comentarios, setComentarios] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [errorModal, setErrorModal] = useState('');

  const avisar = (tipo, texto) => {
    setMensaje({ tipo, texto });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cargarResumenDocs = async () => {
    try {
      const r = await api.get('/inventario/documentos/resumen');
      setResumenDocs(r.data || {});
    } catch (e) {
      setResumenDocs({});
    }
  };

  const cargar = async () => {
    try {
      if (esAdmin) {
        const [est, lot, sol, exp] = await Promise.all([
          api.get('/inventario/estructura'),
          api.get('/inventario/lotes'),
          api.get('/solicitudes-lote'),
          api.get('/procesos-venta')
        ]);
        setEstructura(est.data);
        setLotes(lot.data);
        setSolicitudes(sol.data);
        setExpedientes(exp.data);
        cargarResumenDocs();
      } else if (!esAsesor) {
        const [lot, sol, exp] = await Promise.all([
          api.get('/inventario/disponibles'),
          api.get('/solicitudes-lote'),
          api.get('/procesos-venta')
        ]);
        setLotes(lot.data);
        setSolicitudes(sol.data);
        setExpedientes(exp.data);
      }
    } catch (err) {
      avisar('error', msgError(err));
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCerrarSesion = () => {
    if (logout) logout();
    else {
      localStorage.removeItem('token');
      localStorage.removeItem('usuario');
    }
    navigate('/login');
  };

  // ---------------- Admin: filtros ----------------
  const condominiosFiltro = estructura.condominios.filter((c) => !fFracc || String(c.id_fraccionamiento) === fFracc);
  const manzanasFiltro = estructura.manzanas.filter(
    (m) =>
      (!fFracc || String(m.id_fraccionamiento) === fFracc) &&
      (!fCondo || (fCondo === 'none' ? m.id_condominio === null : String(m.id_condominio) === fCondo))
  );

  const lotesFiltrados = useMemo(() => {
    const q = fBusca.trim().toUpperCase();
    return lotes.filter((l) => {
      if (fFracc && String(l.id_fraccionamiento) !== fFracc) return false;
      if (fCondo === 'none' && l.condominio) return false;
      if (fCondo && fCondo !== 'none' && !(l.condominio && String(l.id_condominio) === fCondo)) return false;
      if (fManzana && String(l.id_manzana) !== fManzana) return false;
      if (fEstado && l.estado !== fEstado) return false;
      if (q && !String(l.codigo_inventario || '').toUpperCase().includes(q)) return false;
      return true;
    });
  }, [lotes, fFracc, fCondo, fManzana, fEstado, fBusca]);

  const resumen = useMemo(() => {
    const cuenta = (e) => lotes.filter((l) => l.estado === e).length;
    return { total: lotes.length, disponibles: cuenta('DISPONIBLE'), asignados: cuenta('ASIGNADO'), otros: lotes.length - cuenta('DISPONIBLE') - cuenta('ASIGNADO') };
  }, [lotes]);

  const pendientes = solicitudes.filter((s) => s.estado === 'PENDIENTE').length;
  const solicitudesFiltradas = solicitudes.filter((s) => !fEstadoSol || s.estado === fEstadoSol);

  // ---------------- Admin: acciones ----------------
  const nombreExpediente = (p) =>
    p.es_para_tercero && p.tercero_nombre_completo
      ? p.tercero_nombre_completo
      : `${p.cliente_nombre || ''} ${p.cliente_apellido || ''}`.trim();

  const expedientesSinLote = expedientes.filter((p) => !p.id_lote);

  const confirmarAsignacion = async () => {
    if (!idExpedienteSel) return setErrorModal('Selecciona el expediente al que se asignará el lote.');
    setProcesando(true);
    setErrorModal('');
    try {
      await api.put(`/procesos-venta/${idExpedienteSel}/lote`, { id_lote: loteAsignar.id_lote });
      setLoteAsignar(null);
      setIdExpedienteSel('');
      avisar('ok', 'Lote asignado correctamente.');
      await cargar();
    } catch (err) {
      setErrorModal(msgError(err));
    } finally {
      setProcesando(false);
    }
  };

  const liberarLote = async (l) => {
    if (!l.id_proceso) return;
    if (!window.confirm(`¿Liberar el lote ${l.codigo_inventario} del expediente #${l.id_proceso}?`)) return;
    try {
      await api.put(`/procesos-venta/${l.id_proceso}/lote`, { id_lote: null });
      avisar('ok', 'Lote liberado correctamente.');
      await cargar();
    } catch (err) {
      avisar('error', msgError(err));
    }
  };

  const resolverSolicitud = async (s, accion) => {
    if (accion === 'aprobar' && !window.confirm(`¿Aprobar la solicitud y asignar ${s.codigo_inventario} al expediente #${s.id_proceso}?`)) return;
    setProcesando(true);
    setErrorModal('');
    try {
      await api.put(`/solicitudes-lote/${s.id_solicitud}/${accion}`, { motivo });
      setSolicitudDetalle(null);
      setMotivo('');
      avisar('ok', accion === 'aprobar' ? 'Solicitud aprobada y lote asignado.' : 'Solicitud rechazada.');
      await cargar();
    } catch (err) {
      setErrorModal(msgError(err));
      await cargar();
    } finally {
      setProcesando(false);
    }
  };

  // ---------------- Cliente: acciones ----------------
  const solicitudesPendientesPorExp = new Set(solicitudes.filter((s) => s.estado === 'PENDIENTE').map((s) => s.id_proceso));
  const expedientesSolicitables = expedientes.filter((p) => !p.id_lote && !solicitudesPendientesPorExp.has(p.id_proceso));
  const expedientesConLote = expedientes.filter((p) => p.id_lote);

  const enviarSolicitud = async () => {
    if (!idExpedienteSel) return setErrorModal('Selecciona el expediente para el que solicitas el lote.');
    setProcesando(true);
    setErrorModal('');
    try {
      await api.post('/solicitudes-lote', { id_proceso: idExpedienteSel, id_lote: loteSolicitar.id_lote, comentarios });
      setLoteSolicitar(null);
      setIdExpedienteSel('');
      setComentarios('');
      avisar('ok', 'Solicitud enviada. Queda pendiente de autorización del administrador.');
      await cargar();
    } catch (err) {
      setErrorModal(msgError(err));
    } finally {
      setProcesando(false);
    }
  };

  const cancelarSolicitud = async (s) => {
    if (!window.confirm('¿Cancelar esta solicitud?')) return;
    try {
      await api.put(`/solicitudes-lote/${s.id_solicitud}/cancelar`);
      avisar('ok', 'Solicitud cancelada.');
      await cargar();
    } catch (err) {
      avisar('error', msgError(err));
    }
  };

  const [fFraccCliente, setFFraccCliente] = useState('');
  const [fBuscaCliente, setFBuscaCliente] = useState('');
  const fraccionamientosDisponibles = useMemo(
    () => [...new Set(lotes.map((l) => l.fraccionamiento).filter(Boolean))],
    [lotes]
  );
  const lotesCliente = lotes.filter(
    (l) =>
      (!fFraccCliente || l.fraccionamiento === fFraccCliente) &&
      (!fBuscaCliente.trim() || String(l.codigo_inventario).toUpperCase().includes(fBuscaCliente.trim().toUpperCase()))
  );

  // ---------------- Render ----------------
  if (cargando) return <div className="p-8 text-center text-gray-500 font-medium">Cargando inventario...</div>;

  const encabezado = (
    <div className="flex flex-wrap justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-gray-100 gap-4">
      <div className="flex items-center space-x-4">
        <img src={logo} alt="Constructora Proyecto 20" className="h-14 object-contain" />
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            {esAdmin ? 'Inventario y Asignación de Lotes' : 'Lotes Disponibles y Mis Solicitudes'}
          </h1>
          <p className="text-gray-500 text-sm">Constructora Proyecto 20 - Sistema de Control de Etapas Inmobiliarias</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {nombreUsuario && (
          <div className="flex items-center gap-2" title={nombreUsuario}>
            <UserCircle className="w-8 h-8 text-gray-400 flex-shrink-0" />
            <span className="text-sm font-bold text-gray-800 text-right">{nombreUsuario}</span>
          </div>
        )}
        <div className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 ${esAdmin ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
          {esAdmin ? <ShieldAlert className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
          ROL: {esAdmin ? 'ADMINISTRADOR' : esAsesor ? 'ASESOR' : 'CLIENTE / USUARIO'}
        </div>
        <button
          type="button"
          onClick={() => navigate('/expedientes')}
          className="bg-gray-50 hover:bg-gray-100 text-gray-700 px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 border border-gray-200 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Expedientes
        </button>
        <button
          type="button"
          onClick={handleCerrarSesion}
          className="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 border border-red-200 cursor-pointer"
        >
          <LogOut className="w-4 h-4" /> Cerrar Sesión
        </button>
      </div>
    </div>
  );

  const banner = mensaje && (
    <div
      className={`flex items-start justify-between gap-3 rounded-lg px-4 py-3 text-sm font-semibold border ${
        mensaje.tipo === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'
      }`}
    >
      <span>{mensaje.texto}</span>
      <button type="button" onClick={() => setMensaje(null)} className="cursor-pointer"><X className="w-4 h-4" /></button>
    </div>
  );

  // Los asesores no administran inventario (solo ADMIN/ADMINISTRADOR)
  if (esAsesor) {
    return (
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {encabezado}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center text-gray-600">
          El módulo de inventario solo está disponible para administradores. Los asesores pueden asignar lotes desde el expediente.
        </div>
      </div>
    );
  }

  // ======================= VISTA ADMINISTRADOR =======================
  if (esAdmin) {
    return (
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {encabezado}
        {banner}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            ['Lotes registrados', resumen.total, 'text-gray-900'],
            ['Disponibles', resumen.disponibles, 'text-emerald-700'],
            ['Asignados', resumen.asignados, 'text-amber-700'],
            ['Reservados / vendidos', resumen.otros, 'text-blue-700']
          ].map(([t, n, c]) => (
            <div key={t} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs font-bold text-gray-500 uppercase">{t}</p>
              <p className={`text-3xl font-extrabold ${c}`}>{n}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-2 border-b border-gray-200">
          {[
            ['inventario', 'Inventario', LayoutGrid],
            ['solicitudes', `Solicitudes de lote${pendientes ? ` (${pendientes})` : ''}`, ClipboardList],
            ['documentos', 'Documentos', FileText]
          ].map(([id, texto, Icono]) => (
            <button
              key={id}
              type="button"
              onClick={() => setPestana(id)}
              className={`px-4 py-2 text-sm font-bold flex items-center gap-2 border-b-2 -mb-px cursor-pointer ${
                pestana === id ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              <Icono className="w-4 h-4" /> {texto}
            </button>
          ))}
        </div>

        {pestana === 'inventario' && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {[
                ['fraccionamiento', 'Fraccionamiento', Building],
                ['condominio', 'Condominio', Building2],
                ['manzana', 'Manzana', MapPin],
                ['lote', 'Lote', Home]
              ].map(([tipo, texto, Icono]) => (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => setFormTipo(tipo)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-xs font-bold rounded-lg shadow flex items-center gap-2 cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4" /> <Icono className="w-4 h-4" /> {texto}
                </button>
              ))}
            </div>

            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
              <select className={inputCls} value={fFracc} onChange={(e) => { setFFracc(e.target.value); setFCondo(''); setFManzana(''); }}>
                <option value="">Todos los fraccionamientos</option>
                {estructura.fraccionamientos.map((f) => <option key={f.id_fraccionamiento} value={f.id_fraccionamiento}>{f.nombre}</option>)}
              </select>
              <select className={inputCls} value={fCondo} onChange={(e) => { setFCondo(e.target.value); setFManzana(''); }}>
                <option value="">Todos los condominios</option>
                <option value="none">Sin condominio</option>
                {condominiosFiltro.map((c) => <option key={c.id_condominio} value={c.id_condominio}>{c.nombre}</option>)}
              </select>
              <select className={inputCls} value={fManzana} onChange={(e) => setFManzana(e.target.value)}>
                <option value="">Todas las manzanas</option>
                {manzanasFiltro.map((m) => <option key={m.id_manzana} value={m.id_manzana}>M-{formatoNum(m.num_manzana)}</option>)}
              </select>
              <select className={inputCls} value={fEstado} onChange={(e) => setFEstado(e.target.value)}>
                <option value="">Todos los estados</option>
                {['DISPONIBLE', 'ASIGNADO', 'RESERVADO', 'VENDIDO'].map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                <input className={`${inputCls} pl-9`} placeholder="Buscar código (LP-M-05...)" value={fBusca} onChange={(e) => setFBusca(e.target.value)} />
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs font-bold text-gray-600 uppercase">
                  <tr>
                    {['Código', 'Ubicación', 'm²', 'Precio', 'Estado', 'Asignado a', 'Documentos', 'Acciones'].map((h) => (
                      <th key={h} className="text-left px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lotesFiltrados.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No hay lotes con esos filtros.</td></tr>
                  )}
                  {lotesFiltrados.map((l) => (
                    <tr key={l.id_lote} className="border-t border-gray-100">
                      <td className="px-4 py-3 font-bold text-blue-700 whitespace-nowrap">{l.codigo_inventario || '—'}</td>
                      <td className="px-4 py-3 text-gray-700">{ubicacion(l) || 'Sin ubicación'}</td>
                      <td className="px-4 py-3">{l.m2 ?? '—'}</td>
                      <td className="px-4 py-3">{moneda(l.precio)}</td>
                      <td className="px-4 py-3"><Badge texto={l.estado} mapa={COLOR_LOTE} /></td>
                      <td className="px-4 py-3 text-gray-700">
                        {l.id_proceso ? (
                          <>
                            <span className="font-semibold">{l.titular_expediente || 'Sin nombre'}</span>
                            <span className="block text-[11px] text-gray-400">Expediente #{l.id_proceso}</span>
                          </>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => {
                            setDocSel({
                              fracc: String(l.id_fraccionamiento ?? ''),
                              condo: l.condominio ? String(l.id_condominio) : '',
                              manzana: String(l.id_manzana ?? ''),
                              lote: String(l.id_lote)
                            });
                            setPestana('documentos');
                          }}
                          className={`text-xs font-bold px-2.5 py-1.5 rounded-lg border flex items-center gap-1 cursor-pointer ${
                            (resumenDocs.LOTE?.[l.id_lote] ?? 0) >= TOTAL_DOCS
                              ? 'text-emerald-700 border-emerald-200 hover:bg-emerald-50'
                              : 'text-gray-600 border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          <FileText className="w-3.5 h-3.5" /> {resumenDocs.LOTE?.[l.id_lote] ?? 0}/{TOTAL_DOCS}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        {l.estado === 'DISPONIBLE' && (
                          <button
                            type="button"
                            onClick={() => { setLoteAsignar(l); setIdExpedienteSel(''); setErrorModal(''); }}
                            className="text-xs font-bold text-blue-700 hover:bg-blue-50 px-2.5 py-1.5 rounded-lg border border-blue-200 flex items-center gap-1 cursor-pointer"
                          >
                            <Link2 className="w-3.5 h-3.5" /> Asignar
                          </button>
                        )}
                        {l.estado === 'ASIGNADO' && l.id_proceso && (
                          <button
                            type="button"
                            onClick={() => liberarLote(l)}
                            className="text-xs font-bold text-red-600 hover:bg-red-50 px-2.5 py-1.5 rounded-lg border border-red-200 flex items-center gap-1 cursor-pointer"
                          >
                            <Unlink className="w-3.5 h-3.5" /> Liberar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {pestana === 'solicitudes' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <select className={`${inputCls} max-w-xs`} value={fEstadoSol} onChange={(e) => setFEstadoSol(e.target.value)}>
                <option value="">Todas las solicitudes</option>
                {['PENDIENTE', 'APROBADA', 'RECHAZADA', 'CANCELADA'].map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs font-bold text-gray-600 uppercase">
                  <tr>
                    {['Fecha', 'Solicitante', 'Expediente', 'Lote', 'Estado del lote', 'Solicitud', 'Acciones'].map((h) => (
                      <th key={h} className="text-left px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {solicitudesFiltradas.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No hay solicitudes.</td></tr>
                  )}
                  {solicitudesFiltradas.map((s) => (
                    <tr key={s.id_solicitud} className="border-t border-gray-100">
                      <td className="px-4 py-3 whitespace-nowrap">{fechaCorta(s.fecha_solicitud)}</td>
                      <td className="px-4 py-3">
                        <span className="font-semibold">{s.solicitante_nombre || '—'}</span>
                        <span className="block text-[11px] text-gray-400">{s.solicitante_email}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold">{s.titular_expediente || '—'}</span>
                        <span className="block text-[11px] text-gray-400">Expediente #{s.id_proceso}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-bold text-blue-700">{s.codigo_inventario}</span>
                        <span className="block text-[11px] text-gray-400">{ubicacion(s)}</span>
                      </td>
                      <td className="px-4 py-3"><Badge texto={s.estado_lote || '—'} mapa={COLOR_LOTE} /></td>
                      <td className="px-4 py-3"><Badge texto={s.estado} mapa={COLOR_SOLICITUD} /></td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => { setSolicitudDetalle(s); setMotivo(''); setErrorModal(''); }}
                          className="text-xs font-bold text-gray-700 hover:bg-gray-100 px-2.5 py-1.5 rounded-lg border border-gray-200 flex items-center gap-1 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" /> Ver
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {pestana === 'documentos' && (() => {
          const condosDoc = estructura.condominios.filter((c) => String(c.id_fraccionamiento) === docSel.fracc);
          const manzanasDoc = estructura.manzanas.filter(
            (m) => String(m.id_fraccionamiento) === docSel.fracc && String(m.id_condominio ?? '') === docSel.condo
          );
          const lotesDoc = lotes.filter((l) => String(l.id_manzana) === docSel.manzana);
          const fraccDoc = estructura.fraccionamientos.find((f) => String(f.id_fraccionamiento) === docSel.fracc);
          const condoDoc = condosDoc.find((c) => String(c.id_condominio) === docSel.condo);
          const loteDoc = lotes.find((l) => String(l.id_lote) === docSel.lote);
          const n = (nivel, id) => resumenDocs[nivel]?.[id] ?? 0;

          return (
            <div className="space-y-4">
              <p className="text-xs text-gray-500">
                Elige un fraccionamiento, y si lo necesitas un condominio, manzana y lote. Cada nivel tiene sus propios documentos; los del fraccionamiento no se duplican en sus lotes.
              </p>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
                <select className={inputCls} value={docSel.fracc} onChange={(e) => setDocSel({ fracc: e.target.value, condo: '', manzana: '', lote: '' })}>
                  <option value="">Fraccionamiento...</option>
                  {estructura.fraccionamientos.map((f) => (
                    <option key={f.id_fraccionamiento} value={f.id_fraccionamiento}>{f.nombre} · {n('FRACCIONAMIENTO', f.id_fraccionamiento)}/{TOTAL_DOCS} docs</option>
                  ))}
                </select>
                <select className={inputCls} value={docSel.condo} disabled={!docSel.fracc} onChange={(e) => setDocSel((d) => ({ ...d, condo: e.target.value, manzana: '', lote: '' }))}>
                  <option value="">Sin condominio</option>
                  {condosDoc.map((c) => (
                    <option key={c.id_condominio} value={c.id_condominio}>{c.nombre} · {n('CONDOMINIO', c.id_condominio)}/{TOTAL_DOCS} docs</option>
                  ))}
                </select>
                <select className={inputCls} value={docSel.manzana} disabled={!docSel.fracc} onChange={(e) => setDocSel((d) => ({ ...d, manzana: e.target.value, lote: '' }))}>
                  <option value="">{manzanasDoc.length ? 'Manzana...' : 'Sin manzanas en esta ubicación'}</option>
                  {manzanasDoc.map((m) => <option key={m.id_manzana} value={m.id_manzana}>M-{formatoNum(m.num_manzana)}</option>)}
                </select>
                <select className={inputCls} value={docSel.lote} disabled={!docSel.manzana} onChange={(e) => setDocSel((d) => ({ ...d, lote: e.target.value }))}>
                  <option value="">Lote...</option>
                  {lotesDoc.map((l) => (
                    <option key={l.id_lote} value={l.id_lote}>{l.codigo_inventario} · {n('LOTE', l.id_lote)}/{TOTAL_DOCS} docs</option>
                  ))}
                </select>
              </div>

              {!docSel.fracc && (
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center text-gray-400 text-sm">
                  Selecciona un fraccionamiento para consultar y cargar sus documentos.
                </div>
              )}
              {docSel.fracc && (
                <PanelDocumentos
                  key={`F${docSel.fracc}`}
                  nivel="FRACCIONAMIENTO"
                  idElemento={docSel.fracc}
                  titulo="Documentos del fraccionamiento"
                  subtitulo={fraccDoc?.nombre}
                  onCambio={cargarResumenDocs}
                />
              )}
              {docSel.condo && (
                <PanelDocumentos
                  key={`C${docSel.condo}`}
                  nivel="CONDOMINIO"
                  idElemento={docSel.condo}
                  titulo="Documentos del condominio"
                  subtitulo={condoDoc ? `${fraccDoc?.nombre} › ${condoDoc.nombre}` : ''}
                  onCambio={cargarResumenDocs}
                />
              )}
              {docSel.lote && (
                <PanelDocumentos
                  key={`L${docSel.lote}`}
                  nivel="LOTE"
                  idElemento={docSel.lote}
                  titulo="Documentos del lote"
                  subtitulo={loteDoc ? `${loteDoc.codigo_inventario} · ${ubicacion(loteDoc)}` : ''}
                  onCambio={cargarResumenDocs}
                />
              )}
              {docSel.manzana && !docSel.lote && (
                <p className="text-xs text-gray-400">Selecciona un lote para consultar los documentos de ese lote.</p>
              )}
            </div>
          );
        })()}

        {formTipo && (
          <FormularioAlta
            tipo={formTipo}
            estructura={estructura}
            onClose={() => setFormTipo(null)}
            onGuardado={async (texto) => {
              setFormTipo(null);
              avisar('ok', texto);
              await cargar();
            }}
          />
        )}

        {loteAsignar && (
          <Modal titulo="Asignar lote a un expediente" subtitulo={`${loteAsignar.codigo_inventario} · ${ubicacion(loteAsignar)}`} onClose={() => setLoteAsignar(null)}>
            <div className="space-y-4">
              <Campo label="Expediente sin lote asignado *">
                <select className={inputCls} value={idExpedienteSel} onChange={(e) => setIdExpedienteSel(e.target.value)}>
                  <option value="">Selecciona un expediente</option>
                  {expedientesSinLote.map((p) => (
                    <option key={p.id_proceso} value={p.id_proceso}>#{p.id_proceso} — {nombreExpediente(p)}</option>
                  ))}
                </select>
              </Campo>
              {errorModal && <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-lg px-3 py-2">{errorModal}</div>}
              <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
                <button type="button" onClick={() => setLoteAsignar(null)} className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer">Cancelar</button>
                <button type="button" disabled={procesando} onClick={confirmarAsignacion} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 text-xs font-bold rounded-lg shadow-md disabled:opacity-50 cursor-pointer">
                  {procesando ? 'Asignando...' : 'Asignar lote'}
                </button>
              </div>
            </div>
          </Modal>
        )}

        {solicitudDetalle && (
          <Modal titulo={`Solicitud #${solicitudDetalle.id_solicitud}`} subtitulo={`Registrada el ${fechaCorta(solicitudDetalle.fecha_solicitud)}`} onClose={() => setSolicitudDetalle(null)}>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="block text-[10px] font-bold text-gray-400 uppercase">Solicitante</span>{solicitudDetalle.solicitante_nombre || '—'}<span className="block text-xs text-gray-400">{solicitudDetalle.solicitante_email}</span></div>
                <div><span className="block text-[10px] font-bold text-gray-400 uppercase">Expediente</span>#{solicitudDetalle.id_proceso} — {solicitudDetalle.titular_expediente}</div>
                <div><span className="block text-[10px] font-bold text-gray-400 uppercase">Código de inventario</span><span className="font-bold text-blue-700">{solicitudDetalle.codigo_inventario}</span></div>
                <div><span className="block text-[10px] font-bold text-gray-400 uppercase">Ubicación</span>{ubicacion(solicitudDetalle)}</div>
                <div><span className="block text-[10px] font-bold text-gray-400 uppercase">m² / Precio</span>{solicitudDetalle.m2 ?? '—'} m² · {moneda(solicitudDetalle.precio)}</div>
                <div><span className="block text-[10px] font-bold text-gray-400 uppercase">Estado del lote</span><Badge texto={solicitudDetalle.estado_lote || '—'} mapa={COLOR_LOTE} /></div>
              </div>
              {solicitudDetalle.comentarios && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs"><b>Comentarios del solicitante:</b> {solicitudDetalle.comentarios}</div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-500">Estado de la solicitud:</span>
                <Badge texto={solicitudDetalle.estado} mapa={COLOR_SOLICITUD} />
              </div>
              {solicitudDetalle.estado !== 'PENDIENTE' && (
                <div className="text-xs text-gray-500">
                  Resuelta el {fechaCorta(solicitudDetalle.fecha_resolucion)}{solicitudDetalle.admin_nombre ? ` por ${solicitudDetalle.admin_nombre}` : ''}
                  {solicitudDetalle.motivo_resolucion ? ` — ${solicitudDetalle.motivo_resolucion}` : ''}
                </div>
              )}
              {solicitudDetalle.estado === 'PENDIENTE' && (
                <>
                  {solicitudDetalle.estado_lote !== 'DISPONIBLE' && (
                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold rounded-lg px-3 py-2">
                      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> Este lote ya no está disponible; no se puede aprobar. Puedes rechazar la solicitud.
                    </div>
                  )}
                  <Campo label="Motivo / observación (opcional)">
                    <input className={inputCls} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Se mostrará al usuario" />
                  </Campo>
                  {errorModal && <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-lg px-3 py-2">{errorModal}</div>}
                  <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
                    <button type="button" disabled={procesando} onClick={() => resolverSolicitud(solicitudDetalle, 'rechazar')} className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 px-4 py-2 text-xs font-bold rounded-lg flex items-center gap-1.5 disabled:opacity-50 cursor-pointer">
                      <XCircle className="w-4 h-4" /> Rechazar
                    </button>
                    <button type="button" disabled={procesando || solicitudDetalle.estado_lote !== 'DISPONIBLE'} onClick={() => resolverSolicitud(solicitudDetalle, 'aprobar')} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-xs font-bold rounded-lg shadow-md flex items-center gap-1.5 disabled:opacity-50 cursor-pointer">
                      <CheckCircle2 className="w-4 h-4" /> Aprobar y asignar
                    </button>
                  </div>
                </>
              )}
            </div>
          </Modal>
        )}
      </div>
    );
  }

  // ======================= VISTA CLIENTE / USUARIO =======================
  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {encabezado}
      {banner}

      {expedientesConLote.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-bold text-gray-800 mb-3">Mis lotes asignados</h2>
          <div className="flex flex-wrap gap-3">
            {expedientesConLote.map((p) => (
              <div key={p.id_proceso} className="border border-emerald-200 bg-emerald-50 rounded-lg px-4 py-2 text-sm">
                <span className="font-bold text-emerald-800">{p.num_lote}</span>
                <span className="block text-[11px] text-emerald-700">Expediente #{p.id_proceso} · {p.lote_estado || 'ASIGNADO'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
        <div className="px-5 py-4 border-b border-gray-100"><h2 className="font-bold text-gray-800">Mis solicitudes</h2></div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs font-bold text-gray-600 uppercase">
            <tr>{['Fecha', 'Lote', 'Expediente', 'Estado', 'Resultado', ''].map((h) => <th key={h} className="text-left px-4 py-3">{h}</th>)}</tr>
          </thead>
          <tbody>
            {solicitudes.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Aún no has solicitado ningún lote.</td></tr>}
            {solicitudes.map((s) => (
              <tr key={s.id_solicitud} className="border-t border-gray-100">
                <td className="px-4 py-3 whitespace-nowrap">{fechaCorta(s.fecha_solicitud)}</td>
                <td className="px-4 py-3"><span className="font-bold text-blue-700">{s.codigo_inventario}</span><span className="block text-[11px] text-gray-400">{ubicacion(s)}</span></td>
                <td className="px-4 py-3">#{s.id_proceso}</td>
                <td className="px-4 py-3"><Badge texto={s.estado} mapa={COLOR_SOLICITUD} /></td>
                <td className="px-4 py-3 text-xs text-gray-600">
                  {s.estado === 'PENDIENTE' && 'En espera de autorización'}
                  {s.estado === 'APROBADA' && 'Lote asignado a tu expediente'}
                  {s.estado === 'RECHAZADA' && (s.motivo_resolucion || 'Solicitud rechazada')}
                  {s.estado === 'CANCELADA' && 'Cancelada'}
                </td>
                <td className="px-4 py-3">
                  {s.estado === 'PENDIENTE' && (
                    <button type="button" onClick={() => cancelarSolicitud(s)} className="text-xs font-bold text-red-600 hover:bg-red-50 px-2.5 py-1.5 rounded-lg border border-red-200 cursor-pointer">Cancelar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3">
        <h2 className="font-bold text-gray-800">Lotes disponibles</h2>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <select className={inputCls} value={fFraccCliente} onChange={(e) => setFFraccCliente(e.target.value)}>
            <option value="">Todos los fraccionamientos</option>
            {fraccionamientosDisponibles.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            <input className={`${inputCls} pl-9`} placeholder="Buscar por código" value={fBuscaCliente} onChange={(e) => setFBuscaCliente(e.target.value)} />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs font-bold text-gray-600 uppercase">
              <tr>{['Código', 'Ubicación', 'm²', 'Precio', ''].map((h) => <th key={h} className="text-left px-4 py-3">{h}</th>)}</tr>
            </thead>
            <tbody>
              {lotesCliente.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No hay lotes disponibles por el momento.</td></tr>}
              {lotesCliente.map((l) => (
                <tr key={l.id_lote} className="border-t border-gray-100">
                  <td className="px-4 py-3 font-bold text-blue-700">{l.codigo_inventario}</td>
                  <td className="px-4 py-3 text-gray-700">{ubicacion(l)}</td>
                  <td className="px-4 py-3">{l.m2}</td>
                  <td className="px-4 py-3">{moneda(l.precio)}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => { setLoteSolicitar(l); setIdExpedienteSel(''); setComentarios(''); setErrorModal(''); }}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" /> Solicitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {loteSolicitar && (
        <Modal titulo="Solicitar lote" subtitulo={`${loteSolicitar.codigo_inventario} · ${ubicacion(loteSolicitar)}`} onClose={() => setLoteSolicitar(null)}>
          <div className="space-y-4">
            {expedientesSolicitables.length === 0 ? (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold rounded-lg px-3 py-2">
                No tienes expedientes disponibles para solicitar un lote (ya tienen lote asignado o una solicitud pendiente).
              </div>
            ) : (
              <Campo label="Expediente *">
                <select className={inputCls} value={idExpedienteSel} onChange={(e) => setIdExpedienteSel(e.target.value)}>
                  <option value="">Selecciona tu expediente</option>
                  {expedientesSolicitables.map((p) => (
                    <option key={p.id_proceso} value={p.id_proceso}>#{p.id_proceso} — {nombreExpediente(p)}</option>
                  ))}
                </select>
              </Campo>
            )}
            <Campo label="Comentarios (opcional)">
              <textarea className={inputCls} rows={3} value={comentarios} onChange={(e) => setComentarios(e.target.value)} />
            </Campo>
            <p className="text-[11px] text-gray-500">La solicitud será revisada por un administrador; el lote no se asigna de inmediato.</p>
            {errorModal && <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-lg px-3 py-2">{errorModal}</div>}
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
              <button type="button" onClick={() => setLoteSolicitar(null)} className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer">Cancelar</button>
              <button type="button" disabled={procesando || expedientesSolicitables.length === 0} onClick={enviarSolicitud} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 text-xs font-bold rounded-lg shadow-md disabled:opacity-50 cursor-pointer">
                {procesando ? 'Enviando...' : 'Enviar solicitud'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
