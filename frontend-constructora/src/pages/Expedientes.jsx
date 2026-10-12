import { useEffect, useState, useContext } from 'react';
import api from '../api/axios';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { 
  FileUp, 
  CreditCard, 
  ArrowRightCircle, 
  CheckCircle2, 
  UserCheck, 
  ShieldAlert, 
  LogOut,
  BarChart3,
  Layers,
  FileText,
  ExternalLink,
  CheckSquare,
  Square,
  Trash2,
  MessageSquare,
  Send,
  PlusCircle,
  Home,
  Save,
  Filter,
  Building,
  RotateCcw,
  Table as TableIcon,
  X,
  ChevronRight,
  FolderPlus,
  UserPlus,
  AlertCircle,
  Pencil,
  UserCircle
} from 'lucide-react';
import logo from '../assets/logo.jpeg';

const API_URL = 'http://localhost:4000';

const TIPOS_PROCESO_VENTA = [
  'C.infonavit',
  'C.bancario',
  'C.cofinavit',
  'C.directo',
  'C.directo plazos',
  'C.isspea',
  'C.cofoviste'
];

const TIPOS_CONSTRUCCION_LISTA = [
  'Todos los tipos',
  'Residencial',
  'Comercial',
  'Industrial',
  'Infraestructura',
  'Mixto'
];

const ETAPAS_VENTA = [
  'Evaluación',
  'Formalización',
  'Armado de expediente',
  'Avalúos',
  'Gestoría',
  'Notaría',
  'Firma',
  'Pagos',
  'Entrega'
];

const REGLAS_ETAPAS = {
  'Evaluación': {
    docs: ['INE', 'CONSTANCIA_SAT', 'CONSULTA_BURO','PRECALIFICACION_INFONAVIT'],
    bins: ['AUTORIZACION']
  },
  'Formalización': {
    docs: ['CONTRATO_PROMESA_VENTA', 'COMPROBANTE_APARTADO'],
    bins: []
  },
  'Armado de expediente': {
    docs: [
      'INE_CLIENTE', 'CONSTANCIA_SAT_CLIENTE', 'CURP', 'COMPROBANTE_DOMICILIO', 
      'ACTA_NACIMIENTO', 'ACTA_MATRIMONIO', 'REF_ID_OFICIAL_COPIA', 'REF_COMPROBANTE_DOMICILIO_COPIA',
      'SOLICITUD_AVALUO', 'SOLICITUD_INSCRIPCION', 'ANEXO_C', 'ANEXO_C_REFERENCIAS', 
      'SIC_AVISO_PRIVACIDAD', 'CARTA_DECLARATORIA', 'CONSTANCIA_CURSO',
      'CEDULA_CONDOMINAL', 'PREDIAL', 'NUMERO_OFICIAL', 'ALINEAMIENTO', 
      'REGIMEN_CONDOMINIO', 'ESCRITURA', 'FACTIBILIDAD_AGUA', 'FACTIBILIDAD_CFE',
      'ACTA_CONSTITUTIVA', 'PODER_REPRESENTANTE_LEGAL', 'ID_REPRESENTANTE_LEGAL', 
      'CONSTANCIA_SAT_EMPRESA', 'CARATULA_ESTADO_CUENTA'
    ],
    bins: []
  },
  'Avalúos': {
    docs: [],
    bins: ['AVALUO_APROBADO']
  },
  'Gestoría': {
    docs: [],
    bins: ['ENTREGA_EXPEDIENTE', 'INGRESO_EXPEDIENTE', 'AUTORIZACION_EXPEDIENTE']
  },
  'Notaría': {
    docs: [],
    bins: ['RECEPCION_EXPEDIENTE_NOTARIA', 'AUTORIZACION_NOTARIA', 'PROGRAMACION_FIRMA']
  },
  'Firma': {
    docs: [],
    bins: ['FIRMA_REALIZADA']
  },
  'Pagos': {
    docs: ['COMPROBANTE_PAGO'],
    bins: ['PAGO_COMPLETO']
  },
  'Entrega': {
    docs: ['ACTA_ENTREGA_RECEPCION'],
    bins: ['ENTREGA_PROPIEDAD']
  }
};

const EJEMPLOS_DOCUMENTOS = {
  'INE': '/plantillas/ejemplo_ine.pdf',
  'CONSTANCIA_SAT': '/plantillas/ejemplo_sat.pdf',
  'CONSULTA_BURO': '/plantillas/ejemplo_buro.pdf',
  'PRECALIFICACION_INFONAVIT': '/plantillas/ejemplo_precalificacion.pdf',
  'CONTRATO_PROMESA_VENTA': '/plantillas/ejemplo_contrato.pdf',
  'COMPROBANTE_APARTADO': '/plantillas/ejemplo_apartado.pdf',
  'CURP': '/plantillas/ejemplo_curp.pdf',
  'COMPROBANTE_DOMICILIO': '/plantillas/ejemplo_domicilio.pdf',
  'ACTA_NACIMIENTO': '/plantillas/ejemplo_acta.pdf',
  'SOLICITUD_AVALUO': '/plantillas/ejemplo_solicitud_avaluo.pdf',
  'SOLICITUD_INSCRIPCION': '/plantillas/ejemplo_inscripcion.pdf',
  'ANEXO_C': '/plantillas/ejemplo_anexo_c.pdf',
  'SIC_AVISO_PRIVACIDAD': '/plantillas/ejemplo_privacidad.pdf',
  'CARTA_DECLARATORIA': '/plantillas/ejemplo_carta_declaratoria.pdf',
  'CONSTANCIA_CURSO': '/plantillas/ejemplo_curso.pdf',
  'COMPROBANTE_PAGO': '/plantillas/ejemplo_pago.pdf',
  'ACTA_ENTREGA_RECEPCION': '/plantillas/ejemplo_acta_entrega.pdf'
};

// ÚNICA fuente para decidir qué persona se muestra como titular visual de un expediente.
// - Expediente normal  (es_para_tercero = false): datos del cliente (c.* -> cliente_nombre, curp, rfc...).
// - Expediente tercero (es_para_tercero = true) : datos del tercero (pv.tercero_*).
// Solo afecta la visualización: id_cliente, es_para_tercero y las columnas tercero_* no se modifican.
const obtenerDatosVisibles = (exp) => {
  if (!exp) return null;

  const nombreCliente = exp.cliente_nombre
    ? `${exp.cliente_nombre} ${exp.cliente_apellido || ''}`.trim()
    : null;

  if (exp.es_para_tercero) {
    return {
      esTercero: true,
      // Si por algún motivo el tercero no tiene nombre, se evita dejar el título vacío.
      nombre: exp.tercero_nombre_completo || nombreCliente,
      email: exp.tercero_email,
      telefono: exp.tercero_telefono,
      curp: exp.tercero_curp,
      rfc: exp.tercero_rfc,
      direccion: exp.tercero_direccion
    };
  }

  return {
    esTercero: false,
    nombre: nombreCliente,
    email: exp.cliente_email || exp.email,
    telefono: exp.telefono || exp.cliente_telefono,
    curp: exp.curp || exp.cliente_curp,
    rfc: exp.rfc || exp.cliente_rfc,
    direccion: exp.direccion || exp.cliente_direccion
  };
};

const obtenerNombreVisible = (exp) => obtenerDatosVisibles(exp)?.nombre || null;

const formatearFecha = (fechaCadena) => {
  if (!fechaCadena) return new Date().toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const f = new Date(fechaCadena);
  return f.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC'
  });
};

const calcularProgresoEtapa = (rutasDocumentos = {}, estadosBinarios = {}, reglasEtapa = { docs: [], bins: [] }) => {
  const { docs = [], bins = [] } = reglasEtapa;
  const totalRequisitos = docs.length + bins.length;

  if (totalRequisitos === 0) {
    return {
      porcentaje: 100,
      color: 'bg-emerald-500',
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      texto: 'Etapa Informativa / Completa',
      completados: 0,
      total: 0
    };
  }

  const docsSubidos = docs.filter((doc) => rutasDocumentos && rutasDocumentos[doc]).length;
  const binsAprobados = bins.filter((bin) => estadosBinarios && estadosBinarios[bin]).length;
  const completados = docsSubidos + binsAprobados;

  const porcentaje = Math.round((completados / totalRequisitos) * 100);

  let color = 'bg-red-500';
  let badgeColor = 'bg-red-100 text-red-800 border-red-300';
  let texto = 'Pendiente / Sin Avance';

  if (porcentaje === 100) {
    color = 'bg-emerald-500';
    badgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-300';
    texto = 'Completo (Listo para avanzar)';
  } else if (porcentaje > 0) {
    color = 'bg-amber-500';
    badgeColor = 'bg-amber-100 text-amber-800 border-amber-300';
    texto = 'En Proceso / Incompleto';
  }

  return { porcentaje, color, badgeColor, texto, completados, total: totalRequisitos };
};

export default function Expedientes() {
  const { usuario, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const esAdmin = usuario?.rol?.toUpperCase() === 'ADMIN' || usuario?.rol?.toUpperCase() === 'ADMINISTRADOR' || usuario?.rol?.toUpperCase() === 'ASESOR';
  // Nombre completo real del usuario autenticado (viene del login; no es texto fijo)
  const nombreCompletoUsuario = (usuario?.nombre_completo || usuario?.nombre || '').trim();

  const [procesos, setProcesos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [creandoExpediente, setCreandoExpediente] = useState(false);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  
  const [mostrarModalNuevoExpediente, setMostrarModalNuevoExpediente] = useState(false);
  const [mostrarModalEditarExpediente, setMostrarModalEditarExpediente] = useState(false);

  // Formulario para crear expediente
  const [datosNuevoExpediente, setDatosNuevoExpediente] = useState({
    es_para_tercero: false,
    id_lote: '',
    nombre: '',
    apellido: '',
    email: '',
    telefono: '',
    curp: '',
    rfc: '',
    direccion: '',
    num_lote: '',
    tipo_construccion: '',
    institucion_financiera: ''
  });

  // Formulario para editar expediente
  const [datosEditarExpediente, setDatosEditarExpediente] = useState({
    id_proceso: null,
    nombre: '',
    apellido: '',
    email: '',
    telefono: '',
    curp: '',
    rfc: '',
    direccion: '',
    num_lote: '',
    tipo_construccion: '',
    institucion_financiera: ''
  });

  const [archivoSeleccionado, setArchivoSeleccionado] = useState(null);
  const [tipoDocumento, setTipoDocumento] = useState('INE');
  const [procesoIdSubiendo, setProcesoIdSubiendo] = useState(null);
  const [comentarioTexto, setComentarioTexto] = useState({});
  const [lotesEditando, setLotesEditando] = useState({});
  const [lotesDisponibles, setLotesDisponibles] = useState([]);

  const [expedienteSeleccionado, setExpedienteSeleccionado] = useState(null);
  const [pestanaActivaModal, setPestanaActivaModal] = useState('seguimiento');

  const [filtroTipoConstruccion, setFiltroTipoConstruccion] = useState('Todos los tipos');
  const [filtroEstadoExpediente, setFiltroEstadoExpediente] = useState('Todos los estados');

  const handleCerrarSesion = () => {
    if (logout) {
      logout();
    } else {
      localStorage.removeItem('token');
      localStorage.removeItem('usuario');
    }
    navigate('/login');
  };

  const cargarDatos = async () => {
    try {
      setCargando(true);
      const resProcesos = await api.get('/procesos-venta');

      const listaNormalizada = resProcesos.data.map((p) => {
        const telEncontrado = p.telefono || p.cliente_telefono || p.telefono_cliente || p.cliente?.telefono || '';
        const emailEncontrado = p.email || p.cliente_email || p.correo || p.cliente?.email || '';
        const curpEncontrada = p.curp || p.cliente_curp || p.cliente?.curp || '';
        const rfcEncontrado = p.rfc || p.cliente_rfc || p.cliente?.rfc || '';
        const direccionEncontrada = p.direccion || p.cliente_direccion || p.cliente?.direccion || '';

        return {
          ...p,
          telefono: telEncontrado,
          cliente_telefono: telEncontrado,
          email: emailEncontrado,
          cliente_email: emailEncontrado,
          curp: curpEncontrada,
          cliente_curp: curpEncontrada,
          rfc: rfcEncontrado,
          cliente_rfc: rfcEncontrado,
          direccion: direccionEncontrada,
          cliente_direccion: direccionEncontrada
        };
      });

      const lista = esAdmin 
        ? listaNormalizada 
        : listaNormalizada.filter((p) => p.id_cliente === usuario?.id_cliente || p.cliente_email === usuario?.email);
      
      setProcesos(lista);

      if (expedienteSeleccionado) {
        const actualizado = lista.find(p => p.id_proceso === expedienteSeleccionado.id_proceso);
        if (actualizado) setExpedienteSeleccionado(actualizado);
      }
    } catch (err) {
      console.error('Error al cargar datos:', err);
    } finally {
      setCargando(false);
    }
  };

  // Lotes DISPONIBLES del inventario, con su código de inventario (solo administrador/asesor)
  const cargarLotesDisponibles = async () => {
    if (!esAdmin) return;
    try {
      const res = await api.get('/lotes/disponibles');
      setLotesDisponibles(res.data);
    } catch (err) {
      console.error('Error al cargar lotes disponibles:', err);
    }
  };

  // Si dos lotes llegaran a generar el mismo código (p. ej. iniciales repetidas en
  // fraccionamientos distintos), se agrega el nombre solo a esos para distinguirlos.
  const conteoCodigos = {};
  lotesDisponibles.forEach((l) => {
    conteoCodigos[l.codigo_inventario] = (conteoCodigos[l.codigo_inventario] || 0) + 1;
  });

  const etiquetaLote = (l) => {
    if (conteoCodigos[l.codigo_inventario] <= 1) return l.codigo_inventario;
    const donde = [l.fraccionamiento, l.condominio].filter(Boolean).join(' / ');
    return donde ? `${l.codigo_inventario} (${donde})` : l.codigo_inventario;
  };

  // Valor del combo de lote en el detalle: lo que el admin eligió o, si no, el lote actual (por id)
  const valorLoteSeleccionado = (exp) =>
    lotesEditando[exp.id_proceso] !== undefined
      ? lotesEditando[exp.id_proceso]
      : (exp.id_lote ? String(exp.id_lote) : '');

  useEffect(() => {
    cargarDatos();
    cargarLotesDisponibles();
  }, [usuario]);

  const handleAbrirModalNuevoExpediente = () => {
    setDatosNuevoExpediente({
      es_para_tercero: false,
      id_lote: '',
      nombre: '',
      apellido: '',
      email: '',
      telefono: '',
      curp: '',
      rfc: '',
      direccion: '',
      num_lote: '',
      tipo_construccion: '',
      institucion_financiera: ''
    });
    setMostrarModalNuevoExpediente(true);
  };

  const handleAbrirModalEditar = (expediente, e) => {
    if (e) e.stopPropagation();

    // Expediente de tercero: el formulario muestra y edita los datos del TERCERO (tercero_*),
    // no los del cliente que inició sesión. El tercero solo tiene "nombre completo", por eso va en Nombre(s).
    if (expediente.es_para_tercero) {
      const t = obtenerDatosVisibles(expediente);
      setDatosEditarExpediente({
        id_proceso: expediente.id_proceso,
        es_para_tercero: true,
        nombre: t.nombre || '',
        apellido: '',
        email: t.email || '',
        telefono: t.telefono || '',
        curp: t.curp || '',
        rfc: t.rfc || '',
        direccion: t.direccion || '',
        num_lote: expediente.num_lote || '',
        tipo_construccion: expediente.tipo_construccion || '',
        institucion_financiera: expediente.institucion_financiera || ''
      });
      setMostrarModalEditarExpediente(true);
      return;
    }

    setDatosEditarExpediente({
      id_proceso: expediente.id_proceso,
      nombre: expediente.cliente_nombre || expediente.nombre || '',
      apellido: expediente.cliente_apellido || expediente.apellido || '',
      email: expediente.cliente_email || expediente.email || '',
      telefono: expediente.cliente_telefono || expediente.telefono || '',
      curp: expediente.cliente_curp || expediente.curp || '',
      rfc: expediente.cliente_rfc || expediente.rfc || '',
      direccion: expediente.cliente_direccion || expediente.direccion || '',
      num_lote: expediente.num_lote || '',
      tipo_construccion: expediente.tipo_construccion || '',
      institucion_financiera: expediente.institucion_financiera || ''
    });
    setMostrarModalEditarExpediente(true);
  };

  const handleGuardarNuevoExpediente = async (e) => {
    e.preventDefault();

    if (!datosNuevoExpediente.nombre.trim() || !datosNuevoExpediente.email.trim()) {
      alert('Por favor ingresa al menos el Nombre y el Correo Electrónico del cliente.');
      return;
    }

    try {
      setCreandoExpediente(true);
      // Solo el CLIENTE puede marcar "para otra persona". Para ADMIN/ASESOR los datos
      // del formulario ya son los del cliente real.
      // IMPORTANTE: NO se envía id_cliente; el backend decide a quién pertenece el expediente.
      const esTercero = !esAdmin && !!datosNuevoExpediente.es_para_tercero;
      const nombreCompleto = `${datosNuevoExpediente.nombre} ${datosNuevoExpediente.apellido || ''}`.trim();

      const payload = {
        nombre: datosNuevoExpediente.nombre.trim(),
        apellido: datosNuevoExpediente.apellido,
        email: datosNuevoExpediente.email.trim(),
        telefono: datosNuevoExpediente.telefono,
        curp: datosNuevoExpediente.curp,
        rfc: datosNuevoExpediente.rfc,
        direccion: datosNuevoExpediente.direccion,
        id_lote: esAdmin && datosNuevoExpediente.id_lote ? Number(datosNuevoExpediente.id_lote) : null,
        tipo_construccion: datosNuevoExpediente.tipo_construccion,
        institucion_financiera: datosNuevoExpediente.institucion_financiera,
        etapa_actual: 'Evaluación',
        es_para_tercero: esTercero,
        tercero_nombre_completo: esTercero ? nombreCompleto : null,
        tercero_telefono: esTercero ? datosNuevoExpediente.telefono : null,
        tercero_email: esTercero ? datosNuevoExpediente.email.trim() : null
      };

      await api.post('/procesos-venta', payload);

      alert('¡Nuevo expediente generado con éxito!');
      setMostrarModalNuevoExpediente(false);

      // Se recarga desde el servidor para mostrar los datos reales (evita duplicados / datos erróneos)
      await cargarDatos();
      await cargarLotesDisponibles();
    } catch (err) {
      console.error('Error al solicitar nuevo expediente:', err);
      alert(err.response?.data?.error || 'Error al generar el nuevo expediente.');
    } finally {
      setCreandoExpediente(false);
    }
  };

  const handleGuardarEdicionExpediente = async (e) => {
    e.preventDefault();

    if (!datosEditarExpediente.nombre.trim() || !datosEditarExpediente.email.trim()) {
      alert('Por favor ingresa al menos el Nombre y el Correo Electrónico.');
      return;
    }

    try {
      setGuardandoEdicion(true);
      const { id_proceso, es_para_tercero, ...payload } = datosEditarExpediente;

      if (es_para_tercero) {
        await api.put(`/procesos-venta/${id_proceso}`, {
          tipo_construccion: payload.tipo_construccion,
          institucion_financiera: payload.institucion_financiera,
          tercero_nombre_completo: `${payload.nombre} ${payload.apellido || ''}`.trim(),
          tercero_email: payload.email.trim(),
          tercero_telefono: payload.telefono,
          tercero_curp: payload.curp,
          tercero_rfc: payload.rfc,
          tercero_direccion: payload.direccion
        });
      } else {
        await api.put(`/procesos-venta/${id_proceso}`, {
          ...payload,
          cliente_nombre: payload.nombre,
          cliente_apellido: payload.apellido,
          cliente_email: payload.email,
          cliente_telefono: payload.telefono,
          cliente_curp: payload.curp,
          cliente_rfc: payload.rfc,
          cliente_direccion: payload.direccion
        });
      }

      alert('¡Expediente actualizado correctamente!');
      setMostrarModalEditarExpediente(false);
      await cargarDatos();
    } catch (err) {
      console.error('Error al actualizar expediente:', err);
      alert(err.response?.data?.error || 'Error al actualizar la información del expediente.');
    } finally {
      setGuardandoEdicion(false);
    }
  };

  // El administrador asigna (o libera) el lote eligiéndolo de la lista de lotes disponibles.
  // Se envía el ID del lote; el backend guarda la referencia y el código de inventario.
  const handleAsignarLote = async (idProceso, e) => {
    if (e) e.stopPropagation();
    const valor = lotesEditando[idProceso];
    if (valor === undefined) return;

    if (valor === '' && !window.confirm('¿Liberar el lote de este expediente? Volverá a quedar disponible en el inventario.')) {
      return;
    }

    try {
      await api.put(`/procesos-venta/${idProceso}/lote`, {
        id_lote: valor === '' ? null : Number(valor)
      });

      alert(valor === '' ? 'Lote liberado correctamente' : 'Lote asignado correctamente');

      setLotesEditando((prev) => {
        const copia = { ...prev };
        delete copia[idProceso];
        return copia;
      });

      await cargarDatos();
      await cargarLotesDisponibles();
    } catch (err) {
      console.error('Error al asignar el lote:', err);
      alert(err.response?.data?.error || 'Error al asignar el lote en el servidor');
      // Por si otro administrador tomó el lote mientras tanto
      await cargarLotesDisponibles();
    }
  };

  const handleCambiarProceso = async (idProceso, nuevoTipo) => {
    try {
      const procesoActual = procesos.find(p => p.id_proceso === idProceso) || {};
      await api.put(`/procesos-venta/${idProceso}`, {
        ...procesoActual,
        institucion_financiera: nuevoTipo
      });
      alert(`Forma de pago actualizada a: ${nuevoTipo}`);
      cargarDatos();
    } catch (err) {
      alert(err.response?.data?.error || 'Error al cambiar la forma de pago');
    }
  };

  const handleCambiarTipoConstruccion = async (idProceso, nuevoTipoConstruccion) => {
    try {
      const procesoActual = procesos.find(p => p.id_proceso === idProceso) || {};
      await api.put(`/procesos-venta/${idProceso}`, {
        ...procesoActual,
        tipo_construccion: nuevoTipoConstruccion
      });

      setProcesos((prevProcesos) =>
        prevProcesos.map((p) =>
          p.id_proceso === idProceso
            ? { ...p, tipo_construccion: nuevoTipoConstruccion }
            : p
        )
      );

      if (expedienteSeleccionado?.id_proceso === idProceso) {
        setExpedienteSeleccionado(prev => ({ ...prev, tipo_construccion: nuevoTipoConstruccion }));
      }

      alert(`Categoría actualizada a: ${nuevoTipoConstruccion}`);
    } catch (err) {
      alert(err.response?.data?.error || 'Error al cambiar la categoría');
    }
  };

  const handleSubirArchivo = async (idProceso) => {
    if (!archivoSeleccionado) {
      alert('Por favor selecciona un archivo primero');
      return;
    }

    const formData = new FormData();
    formData.append('documento', archivoSeleccionado);
    formData.append('tipo_documento', tipoDocumento);

    try {
      setProcesoIdSubiendo(idProceso);
      const res = await api.post(`/procesos-venta/${idProceso}/documento`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      alert('Documento enviado correctamente');
      setArchivoSeleccionado(null);
      
      if (res.data && res.data.rutas_documentos) {
        setProcesos((prevProcesos) =>
          prevProcesos.map((p) =>
            p.id_proceso === idProceso
              ? { ...p, rutas_documentos: res.data.rutas_documentos }
              : p
          )
        );
        if (expedienteSeleccionado?.id_proceso === idProceso) {
          setExpedienteSeleccionado(prev => ({ ...prev, rutas_documentos: res.data.rutas_documentos }));
        }
      } else {
        cargarDatos();
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Error al subir el archivo');
    } finally {
      setProcesoIdSubiendo(null);
    }
  };

  const handleEliminarDocumento = async (idProceso, tipoDoc) => {
    if (!window.confirm(`¿Estás seguro de desvincular o rechazar el documento "${tipoDoc}" de este expediente?`)) {
      return;
    }

    const nuevasRutas = { ...(expedienteSeleccionado?.rutas_documentos || {}) };
    delete nuevasRutas[tipoDoc];

    try {
      const procesoActual = procesos.find(p => p.id_proceso === idProceso) || {};
      await api.put(`/procesos-venta/${idProceso}`, {
        ...procesoActual,
        rutas_documentos: nuevasRutas
      });

      setProcesos((prevProcesos) =>
        prevProcesos.map((p) =>
          p.id_proceso === idProceso
            ? { ...p, rutas_documentos: nuevasRutas }
            : p
        )
      );

      if (expedienteSeleccionado?.id_proceso === idProceso) {
        setExpedienteSeleccionado(prev => ({ ...prev, rutas_documentos: nuevasRutas }));
      }

      alert(`Documento "${tipoDoc}" removido con éxito.`);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Error al desvincular el documento');
    }
  };

  const handleToggleEstadoBinario = async (proceso, reglaBinaria) => {
    if (!esAdmin) {
      alert('Solo un administrador puede autorizar este estatus.');
      return;
    }

    const estadosActuales = proceso.estados_binarios || {};
    const nuevoValor = !estadosActuales[reglaBinaria];
    const estadosActualizados = { ...estadosActuales, [reglaBinaria]: nuevoValor };

    try {
      await api.put(`/procesos-venta/${proceso.id_proceso}`, {
        ...proceso,
        estados_binarios: estadosActualizados
      });
      
      setProcesos((prevProcesos) =>
        prevProcesos.map((p) =>
          p.id_proceso === proceso.id_proceso
            ? { ...p, estados_binarios: estadosActualizados }
            : p
        )
      );

      if (expedienteSeleccionado?.id_proceso === proceso.id_proceso) {
        setExpedienteSeleccionado(prev => ({ ...prev, estados_binarios: estadosActualizados }));
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Error al actualizar el estado binario');
    }
  };

  const handleAvanzarEtapa = async (proceso, e) => {
    if (e) e.stopPropagation();

    const etapaActual = proceso.etapa_actual || 'Evaluación';
    const idxActual = ETAPAS_VENTA.findIndex(
      (e) => e.toLowerCase() === etapaActual.toLowerCase()
    );

    if (idxActual === -1 || idxActual >= ETAPAS_VENTA.length - 1) {
      alert('El proceso ya se encuentra en la última etapa (Entrega).');
      return;
    }

    const reglas = REGLAS_ETAPAS[ETAPAS_VENTA[idxActual]] || { docs: [], bins: [] };
    const documentosSubidos = proceso.rutas_documentos ? Object.keys(proceso.rutas_documentos) : [];
    const estadosBinarios = proceso.estados_binarios || {};

    const docsFaltantes = reglas.docs.filter((doc) => !documentosSubidos.includes(doc));
    const binsFaltantes = reglas.bins.filter((bin) => !estadosBinarios[bin]);

    if (docsFaltantes.length > 0 || binsFaltantes.length > 0) {
      let mensaje = 'No se puede avanzar la etapa. Requisitos pendientes:\n';
      if (docsFaltantes.length > 0) mensaje += `\n• Documentos: ${docsFaltantes.join(', ')}`;
      if (binsFaltantes.length > 0) mensaje += `\n• Validaciones/Estatus: ${binsFaltantes.join(', ')}`;
      alert(mensaje);
      return;
    }

    const siguienteEtapa = ETAPAS_VENTA[idxActual + 1];

    try {
      await api.put(`/procesos-venta/${proceso.id_proceso}`, {
        ...proceso,
        etapa_actual: siguienteEtapa
      });
      alert(`¡Etapa autorizada! El expediente ha avanzado a: ${siguienteEtapa}`);
      cargarDatos();
    } catch (err) {
      alert(err.response?.data?.error || 'Error al autorizar la siguiente etapa');
    }
  };

  const handleEliminarExpediente = async (idProceso, e) => {
    if (e) e.stopPropagation();

    if (!window.confirm(`¿Estás seguro de que deseas eliminar permanentemente el Expediente #${idProceso}?`)) {
      return;
    }
    try {
      await api.delete(`/procesos-venta/${idProceso}`);
      alert('Expediente eliminado con éxito');
      setProcesos(procesos.filter((p) => p.id_proceso !== idProceso));
      if (expedienteSeleccionado?.id_proceso === idProceso) {
        setExpedienteSeleccionado(null);
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Error al eliminar el expediente');
    }
  };

  const handleEnviarComentario = async (idProceso) => {
    const texto = comentarioTexto[idProceso];
    if (!texto || !texto.trim()) return;

    try {
      const res = await api.post(`/procesos-venta/${idProceso}/comentario`, {
        comentario: texto
      });

      setProcesos(procesos.map(p => 
        p.id_proceso === idProceso ? { ...p, observaciones: res.data.observaciones } : p
      ));

      if (expedienteSeleccionado?.id_proceso === idProceso) {
        setExpedienteSeleccionado(prev => ({ ...prev, observaciones: res.data.observaciones }));
      }

      setComentarioTexto(prev => ({ ...prev, [idProceso]: '' }));
    } catch (err) {
      alert('Error al guardar el mensaje');
    }
  };

  const conteoPorEtapa = ETAPAS_VENTA.reduce((acc, etapa) => {
    acc[etapa] = procesos.filter(
      (p) => (p.etapa_actual || 'Evaluación').toLowerCase() === etapa.toLowerCase()
    ).length;
    return acc;
  }, {});

  const procesosFiltrados = procesos.filter((p) => {
    const cumpleTipo =
      filtroTipoConstruccion === 'Todos los tipos' ||
      (p.tipo_construccion || '').toLowerCase() === filtroTipoConstruccion.toLowerCase();

    const cumpleEstado =
      filtroEstadoExpediente === 'Todos los estados' ||
      (p.etapa_actual || 'Evaluación').toLowerCase() === filtroEstadoExpediente.toLowerCase();

    return cumpleTipo && cumpleEstado;
  });

  // Datos de la persona titular del expediente (cliente o tercero) según obtenerDatosVisibles.
  const datosPersonaExpediente = obtenerDatosVisibles(expedienteSeleccionado);
  const esExpedienteTercero = !!datosPersonaExpediente?.esTercero;

  if (cargando) return <div className="p-8 text-center text-gray-500 font-medium">Cargando datos...</div>;

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      
      {/* BARRA SUPERIOR */}
      <div className="flex flex-wrap justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-gray-100 gap-4">
        <div className="flex items-center space-x-4">
          <img src={logo} alt="Constructora Proyecto 20" className="h-14 object-contain" />
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              {esAdmin ? 'Panel de Administración de Expedientes' : 'Mis Expedientes Digitales de Compra'}
            </h1>
            <p className="text-gray-500 text-sm">
              Constructora Proyecto 20 - Sistema de Control de Etapas Inmobiliarias
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {nombreCompletoUsuario && (
            <div className="flex items-center gap-2" title={nombreCompletoUsuario}>
              <UserCircle className="w-8 h-8 text-gray-400 flex-shrink-0" />
              <span className="text-sm font-bold text-gray-800 text-right">{nombreCompletoUsuario}</span>
            </div>
          )}
          <div className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 ${
            esAdmin ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
          }`}>
            {esAdmin ? <ShieldAlert className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
            ROL: {esAdmin ? 'ADMINISTRADOR' : 'CLIENTE / USUARIO'}
          </div>

          <button
            type="button"
            onClick={() => navigate('/inventario')}
            className="bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition border border-blue-200 cursor-pointer"
          >
            <Building className="w-4 h-4" /> {esAdmin ? 'Inventario' : 'Lotes disponibles'}
          </button>

          <button
            type="button"
            onClick={handleCerrarSesion}
            className="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition border border-red-200 cursor-pointer"
          >
            <LogOut className="w-4 h-4" /> Cerrar Sesión
          </button>
        </div>
      </div>

      {/* DASHBOARD EXCLUSIVO DE ADMINISTRADOR */}
      {esAdmin && (
        <div className="bg-slate-900 text-white p-6 rounded-xl shadow-lg space-y-4">
          <div className="flex flex-wrap justify-between items-center border-b border-slate-700 pb-3 gap-2">
            <div className="flex items-center gap-2">
              <BarChart3 className="text-purple-400 w-5 h-5" />
              <h2 className="text-base font-bold tracking-wide">Resumen General de Ventas</h2>
            </div>
            <div className="bg-purple-600/30 border border-purple-500/40 text-purple-200 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-purple-400" /> Total Activos: {procesos.length} Expedientes
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-9 gap-2">
            {ETAPAS_VENTA.map((etapa, idx) => {
              const cantidad = conteoPorEtapa[etapa] || 0;
              return (
                <div key={etapa} className={`p-3 rounded-lg border text-center transition ${
                  cantidad > 0 ? 'bg-slate-800/90 border-purple-500/50 text-white' : 'bg-slate-800/30 border-slate-800 text-slate-500'
                }`}>
                  <div className="text-[10px] uppercase font-semibold text-slate-400 truncate mb-1" title={etapa}>
                    {idx + 1}. {etapa}
                  </div>
                  <div className={`text-xl font-extrabold ${cantidad > 0 ? 'text-purple-400' : 'text-slate-600'}`}>
                    {cantidad}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* BANNER CLIENTE */}
      {!esAdmin && (
        <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white p-5 rounded-xl shadow-md flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold flex items-center gap-2">
              <FolderPlus className="w-5 h-5 text-blue-300" /> ¿Necesitas iniciar un nuevo trámite?
            </h3>
            <p className="text-blue-100 text-xs mt-1">
              Completa los datos requeridos para registrar un expediente adicional para otro inmueble o titular.
            </p>
          </div>
          <button
            type="button"
            onClick={handleAbrirModalNuevoExpediente}
            className="bg-blue-500 hover:bg-blue-400 text-white font-bold px-5 py-2.5 rounded-xl text-xs inline-flex items-center gap-2 shadow-lg transition cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            Generar Nuevo Expediente
          </button>
        </div>
      )}

      {/* PANEL Y TABLA DE EXPEDIENTES */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-start">

        {/* PANEL LATERAL DE FILTROS */}
        <aside className="bg-white rounded-xl shadow-md border border-gray-100 p-5 space-y-6">
          <div className="flex items-center justify-between border-b pb-3">
            <div className="flex items-center gap-2 text-gray-800 font-bold">
              <Filter className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm uppercase tracking-wider">Filtros</h3>
            </div>

            {(filtroTipoConstruccion !== 'Todos los tipos' || filtroEstadoExpediente !== 'Todos los estados') && (
              <button
                type="button"
                onClick={() => {
                  setFiltroTipoConstruccion('Todos los tipos');
                  setFiltroEstadoExpediente('Todos los estados');
                }}
                className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 transition cursor-pointer"
                title="Limpiar filtros"
              >
                <RotateCcw className="w-3 h-3" /> Limpiar
              </button>
            )}
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-bold text-gray-600 uppercase flex items-center gap-1.5">
              <Building className="w-3.5 h-3.5 text-gray-500" /> Categorías
            </h4>
            <div className="flex flex-col gap-1">
              {TIPOS_CONSTRUCCION_LISTA.map((tipo) => {
                const activo = filtroTipoConstruccion === tipo;
                return (
                  <button
                    key={tipo}
                    type="button"
                    onClick={() => setFiltroTipoConstruccion(tipo)}
                    className={`text-left text-xs px-3 py-2 rounded-lg font-medium transition cursor-pointer ${
                      activo
                        ? 'bg-blue-600 text-white font-bold shadow-sm'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {tipo}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-gray-100">
            <h4 className="text-xs font-bold text-gray-600 uppercase flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-gray-500" /> Estados del Expediente
            </h4>
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => setFiltroEstadoExpediente('Todos los estados')}
                className={`text-left text-xs px-3 py-2 rounded-lg font-medium transition cursor-pointer ${
                  filtroEstadoExpediente === 'Todos los estados'
                    ? 'bg-blue-600 text-white font-bold shadow-sm'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                Todos los estados
              </button>
              {ETAPAS_VENTA.map((estado) => {
                const activo = filtroEstadoExpediente.toLowerCase() === estado.toLowerCase();
                return (
                  <button
                    key={estado}
                    type="button"
                    onClick={() => setFiltroEstadoExpediente(estado)}
                    className={`text-left text-xs px-3 py-2 rounded-lg font-medium transition cursor-pointer ${
                      activo
                        ? 'bg-blue-600 text-white font-bold shadow-sm'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {estado}
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* TABLA PRINCIPAL */}
        <main className="md:col-span-3 space-y-6">
          {procesosFiltrados.length === 0 ? (
            <div className="bg-white rounded-xl shadow-md border border-gray-100 p-12 text-center space-y-4">
              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto">
                <FileText className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-gray-800">
                No se encontraron expedientes con los filtros seleccionados
              </h3>
              <p className="text-gray-500 text-sm max-w-md mx-auto">
                Prueba borrando o ajustando los filtros de búsqueda del panel izquierdo.
              </p>
              {procesos.length === 0 && (
                <button
                  type="button"
                  onClick={handleAbrirModalNuevoExpediente}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold text-sm inline-flex items-center gap-2 transition shadow-md cursor-pointer mt-2"
                >
                  <PlusCircle className="w-5 h-5" /> 
                  Generar mi expediente ahora
                </button>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
              <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <h3 className="font-bold text-gray-800 text-sm flex items-center gap-2">
                  <TableIcon className="w-4 h-4 text-blue-600" /> Registro de Expedientes
                </h3>
                <span className="text-xs text-gray-500 font-medium">
                  Haga clic en cualquier fila para abrir el detalle del expediente
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-gray-600 border-collapse">
                  <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider border-b border-gray-200">
                    <tr>
                      <th className="p-3">Folio</th>
                      <th className="p-3">Cliente</th>
                      <th className="p-3">Lote / Mz</th>
                      <th className="p-3">Categoría</th>
                      <th className="p-3">Forma de pago</th>
                      <th className="p-3">Etapa Actual</th>
                      <th className="p-3 text-center">Avance</th>
                      <th className="p-3 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {procesosFiltrados.map((p) => {
                      const etapaActual = p.etapa_actual || 'Evaluación';
                      const reglasEtapaActual = REGLAS_ETAPAS[etapaActual] || { docs: [], bins: [] };
                      const avance = calcularProgresoEtapa(p.rutas_documentos, p.estados_binarios, reglasEtapaActual);

                      return (
                        <tr 
                          key={p.id_proceso} 
                          onClick={() => {
                            setExpedienteSeleccionado(p);
                            setPestanaActivaModal('seguimiento');
                          }}
                          className="hover:bg-blue-50/60 transition cursor-pointer group"
                        >
                          <td className="p-3 font-bold text-blue-600">#{p.id_proceso}</td>
                          <td className="p-3 font-bold text-gray-800 group-hover:text-blue-700">
                            {obtenerNombreVisible(p) || `ID: ${p.id_cliente}`}
                          </td>
                          <td className="p-3 font-semibold text-amber-800">
                            {p.num_lote || 'Sin Asignar'}
                          </td>
                          <td className="p-3">
                            <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded font-semibold border border-purple-200">
                              {p.tipo_construccion || 'Sin asignar'}
                            </span>
                          </td>
                          <td className="p-3 font-medium text-gray-700">
                            {p.institucion_financiera || 'Sin asignar'}
                          </td>
                          <td className="p-3">
                            <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full font-bold border border-blue-200">
                              {etapaActual}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <span className={`w-2.5 h-2.5 rounded-full ${avance.color}`} />
                              <span className="font-bold">{avance.porcentaje}%</span>
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={(e) => handleAbrirModalEditar(p, e)}
                                className="bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-300 font-bold px-2.5 py-1.5 rounded-lg text-xs inline-flex items-center gap-1 transition shadow-sm cursor-pointer"
                                title="Editar datos del expediente"
                              >
                                <Pencil className="w-3.5 h-3.5" /> Editar
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpedienteSeleccionado(p);
                                  setPestanaActivaModal('seguimiento');
                                }}
                                className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs inline-flex items-center gap-1 transition shadow-sm cursor-pointer"
                              >
                                Ver <ChevronRight className="w-3.5 h-3.5" />
                              </button>
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
        </main>
      </div>

      {/* MODAL 1: NUEVO EXPEDIENTE */}
      {mostrarModalNuevoExpediente && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-lg p-6 space-y-5 relative">
            <button
              type="button"
              onClick={() => setMostrarModalNuevoExpediente(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 bg-gray-100 p-2 rounded-full transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="border-b pb-3 pr-8">
              <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <UserPlus className="w-6 h-6 text-blue-600" /> Captura de Datos del Cliente
              </h3>
              <p className="text-gray-500 text-xs mt-1">
                {esAdmin
                  ? 'Captura los datos del cliente a cuyo nombre se dará de alta el nuevo expediente.'
                  : datosNuevoExpediente.es_para_tercero
                    ? 'Captura los datos de la persona a cuyo nombre se realizará el trámite.'
                    : 'Ingresa la información requerida para dar de alta tu nuevo expediente.'}
              </p>
            </div>

            <form onSubmit={handleGuardarNuevoExpediente} autoComplete="off" className="space-y-4">
              {!esAdmin && (
                <label className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!datosNuevoExpediente.es_para_tercero}
                    onChange={(e) => setDatosNuevoExpediente({ ...datosNuevoExpediente, es_para_tercero: e.target.checked })}
                    className="mt-0.5 cursor-pointer"
                  />
                  <span className="text-xs text-amber-900">
                    <b>Este expediente es para otra persona</b>
                    <br />
                    Los datos de abajo serán los de la persona a nombre de quien se realizará el trámite.
                    El expediente seguirá visible desde tu cuenta.
                  </span>
                </label>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Nombre(s) *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Juan Carlos"
                    value={datosNuevoExpediente.nombre}
                    onChange={(e) => setDatosNuevoExpediente({ ...datosNuevoExpediente, nombre: e.target.value })}
                    className="w-full text-xs p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Apellidos</label>
                  <input
                    type="text"
                    placeholder="Ej. Pérez Gómez"
                    value={datosNuevoExpediente.apellido}
                    onChange={(e) => setDatosNuevoExpediente({ ...datosNuevoExpediente, apellido: e.target.value })}
                    className="w-full text-xs p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Correo Electrónico *</label>
                  <input
                    type="email"
                    required
                    placeholder="correo@ejemplo.com"
                    value={datosNuevoExpediente.email}
                    onChange={(e) => setDatosNuevoExpediente({ ...datosNuevoExpediente, email: e.target.value })}
                    className="w-full text-xs p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Teléfono de Contacto</label>
                  <input
                    type="tel"
                    placeholder="10 dígitos"
                    value={datosNuevoExpediente.telefono}
                    onChange={(e) => setDatosNuevoExpediente({ ...datosNuevoExpediente, telefono: e.target.value })}
                    className="w-full text-xs p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">CURP</label>
                  <input
                    type="text"
                    placeholder="Ej. ABCD123456EFGHIJ01"
                    value={datosNuevoExpediente.curp}
                    onChange={(e) => setDatosNuevoExpediente({ ...datosNuevoExpediente, curp: e.target.value.toUpperCase() })}
                    className="w-full text-xs p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">RFC</label>
                  <input
                    type="text"
                    placeholder="Ej. ABC123456XYZ"
                    value={datosNuevoExpediente.rfc}
                    onChange={(e) => setDatosNuevoExpediente({ ...datosNuevoExpediente, rfc: e.target.value.toUpperCase() })}
                    className="w-full text-xs p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Dirección Completa</label>
                <input
                  type="text"
                  placeholder="Calle, número, colonia, C.P."
                  value={datosNuevoExpediente.direccion}
                  onChange={(e) => setDatosNuevoExpediente({ ...datosNuevoExpediente, direccion: e.target.value })}
                  className="w-full text-xs p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Categoría</label>
                  <select
                    value={datosNuevoExpediente.tipo_construccion}
                    onChange={(e) => setDatosNuevoExpediente({ ...datosNuevoExpediente, tipo_construccion: e.target.value })}
                    className="w-full text-xs p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer"
                  >
                    <option value="">Sin asignar</option>
                    {TIPOS_CONSTRUCCION_LISTA.filter(t => t !== 'Todos los tipos').map((tipo) => (
                      <option key={tipo} value={tipo}>{tipo}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Forma de pago</label>
                  <select
                    value={datosNuevoExpediente.institucion_financiera}
                    onChange={(e) => setDatosNuevoExpediente({ ...datosNuevoExpediente, institucion_financiera: e.target.value })}
                    className="w-full text-xs p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer"
                  >
                    <option value="">Sin asignar</option>
                    {TIPOS_PROCESO_VENTA.map((tipo) => (
                      <option key={tipo} value={tipo}>{tipo}</option>
                    ))}
                  </select>
                </div>
                {esAdmin && (
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Lote (opcional)</label>
                    <select
                      value={datosNuevoExpediente.id_lote}
                      onChange={(e) => setDatosNuevoExpediente({ ...datosNuevoExpediente, id_lote: e.target.value })}
                      className="w-full text-xs p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer"
                    >
                      <option value="">Seleccionar lote</option>
                      {lotesDisponibles.map((l) => (
                        <option key={l.id_lote} value={String(l.id_lote)}>{etiquetaLote(l)}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setMostrarModalNuevoExpediente(false)}
                  className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creandoExpediente}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 text-xs font-bold rounded-lg transition shadow-md disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4" />
                  {creandoExpediente ? 'Generando...' : 'Crear Expediente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: EDITAR EXPEDIENTE EXISTENTE */}
      {mostrarModalEditarExpediente && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-lg p-6 space-y-5 relative">
            <button
              type="button"
              onClick={() => setMostrarModalEditarExpediente(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 bg-gray-100 p-2 rounded-full transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="border-b pb-3 pr-8">
              <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <Pencil className="w-5 h-5 text-amber-600" /> Editar Expediente #{datosEditarExpediente.id_proceso}
              </h3>
              <p className="text-gray-500 text-xs mt-1">
                Modifica los datos del expediente e información del cliente.
              </p>
            </div>

            <form onSubmit={handleGuardarEdicionExpediente} autoComplete="off" className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Nombre(s) *</label>
                  <input
                    type="text"
                    required
                    value={datosEditarExpediente.nombre}
                    onChange={(e) => setDatosEditarExpediente({ ...datosEditarExpediente, nombre: e.target.value })}
                    className="w-full text-xs p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Apellidos</label>
                  <input
                    type="text"
                    value={datosEditarExpediente.apellido}
                    onChange={(e) => setDatosEditarExpediente({ ...datosEditarExpediente, apellido: e.target.value })}
                    className="w-full text-xs p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Correo Electrónico *</label>
                  <input
                    type="email"
                    required
                    value={datosEditarExpediente.email}
                    onChange={(e) => setDatosEditarExpediente({ ...datosEditarExpediente, email: e.target.value })}
                    className="w-full text-xs p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Teléfono de Contacto</label>
                  <input
                    type="tel"
                    value={datosEditarExpediente.telefono}
                    onChange={(e) => setDatosEditarExpediente({ ...datosEditarExpediente, telefono: e.target.value })}
                    className="w-full text-xs p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">CURP</label>
                  <input
                    type="text"
                    value={datosEditarExpediente.curp}
                    onChange={(e) => setDatosEditarExpediente({ ...datosEditarExpediente, curp: e.target.value.toUpperCase() })}
                    className="w-full text-xs p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">RFC</label>
                  <input
                    type="text"
                    value={datosEditarExpediente.rfc}
                    onChange={(e) => setDatosEditarExpediente({ ...datosEditarExpediente, rfc: e.target.value.toUpperCase() })}
                    className="w-full text-xs p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Dirección Completa</label>
                <input
                  type="text"
                  value={datosEditarExpediente.direccion}
                  onChange={(e) => setDatosEditarExpediente({ ...datosEditarExpediente, direccion: e.target.value })}
                  className="w-full text-xs p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Categoría</label>
                  <select
                    value={datosEditarExpediente.tipo_construccion}
                    onChange={(e) => setDatosEditarExpediente({ ...datosEditarExpediente, tipo_construccion: e.target.value })}
                    className="w-full text-xs p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none cursor-pointer"
                  >
                    <option value="">Sin asignar</option>
                    {TIPOS_CONSTRUCCION_LISTA.filter(t => t !== 'Todos los tipos').map((tipo) => (
                      <option key={tipo} value={tipo}>{tipo}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Forma de pago</label>
                  <select
                    value={datosEditarExpediente.institucion_financiera}
                    onChange={(e) => setDatosEditarExpediente({ ...datosEditarExpediente, institucion_financiera: e.target.value })}
                    className="w-full text-xs p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none cursor-pointer"
                  >
                    <option value="">Sin asignar</option>
                    {TIPOS_PROCESO_VENTA.map((tipo) => (
                      <option key={tipo} value={tipo}>{tipo}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setMostrarModalEditarExpediente(false)}
                  className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoEdicion}
                  className="bg-amber-600 hover:bg-amber-700 text-white px-5 py-2 text-xs font-bold rounded-lg transition shadow-md disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  {guardandoEdicion ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: SEGUIMIENTO DE FASES CON NAVEGACIÓN DE PESTAÑAS */}
      {expedienteSeleccionado && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 space-y-6 relative">
            
            <button
              type="button"
              onClick={() => setExpedienteSeleccionado(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 bg-gray-100 p-2 rounded-full transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* NAVEGACIÓN POR PESTAÑAS EN LA MODAL */}
            <div className="border-b border-gray-200 pb-2 flex justify-between items-center pr-10">
              <div className="flex gap-6 text-sm font-bold">
                <button
                  type="button"
                  onClick={() => setPestanaActivaModal('seguimiento')}
                  className={`pb-2 transition cursor-pointer relative ${
                    pestanaActivaModal === 'seguimiento'
                      ? 'text-blue-600 border-b-2 border-blue-600 font-extrabold'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  Seguimiento de expediente
                </button>
                <button
                  type="button"
                  onClick={() => setPestanaActivaModal('informacion')}
                  className={`pb-2 transition cursor-pointer relative ${
                    pestanaActivaModal === 'informacion'
                      ? 'text-blue-600 border-b-2 border-blue-600 font-extrabold'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  Información del expediente
                </button>
              </div>

              <button
                type="button"
                onClick={(e) => handleAbrirModalEditar(expedienteSeleccionado, e)}
                className="bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-300 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition shadow-sm cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" /> Editar Expediente
              </button>
            </div>

            {/* CONTENIDO DE LA PESTAÑA 1: SEGUIMIENTO DE EXPEDIENTE */}
            {pestanaActivaModal === 'seguimiento' && (
              <div className="space-y-6">
                <div className="flex flex-wrap justify-between items-center border-b pb-4 gap-4 pr-10">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-blue-600 uppercase bg-blue-50 px-3 py-1 rounded-full">
                        Folio #{expedienteSeleccionado.id_proceso}
                      </span>
                      <span className="text-xs font-semibold text-purple-700 uppercase bg-purple-50 px-3 py-1 rounded-full border border-purple-200">
                        {expedienteSeleccionado.tipo_construccion || 'Sin asignar'}
                      </span>
                    </div>
                    <h3 className="text-2xl font-bold text-gray-800 mt-1">
                      {obtenerNombreVisible(expedienteSeleccionado) || `Cliente ID: ${expedienteSeleccionado.id_cliente}`}
                    </h3>
                    {esExpedienteTercero && (datosPersonaExpediente?.telefono || datosPersonaExpediente?.email) && (
                      <p className="text-xs font-semibold text-amber-700 mt-1">
                        {[
                          datosPersonaExpediente.telefono ? `Tel. ${datosPersonaExpediente.telefono}` : null,
                          datosPersonaExpediente.email || null
                        ].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <div className="flex items-center gap-1.5 bg-purple-50 border border-purple-200 px-3 py-1 rounded-lg shadow-sm">
                      <Building className="w-4 h-4 text-purple-600" />
                      <label className="text-xs font-bold text-purple-900">Categoría:</label>
                      <select
                        value={expedienteSeleccionado.tipo_construccion || 'Sin asignar'}
                        onChange={(e) => handleCambiarTipoConstruccion(expedienteSeleccionado.id_proceso, e.target.value)}
                        disabled={!esAdmin}
                        className="bg-transparent text-xs font-bold text-purple-800 focus:outline-none cursor-pointer border-b border-purple-300 disabled:border-none"
                      >
                        <option value="">Sin asignar</option>
                        {TIPOS_CONSTRUCCION_LISTA.filter(t => t !== 'Todos los tipos').map((tipo) => (
                          <option key={tipo} value={tipo}>{tipo}</option>
                        ))}
                      </select>
                    </div>

                    {esAdmin ? (
                      <div className="flex flex-wrap items-center gap-2 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg shadow-sm">
                        <Home className="w-4 h-4 text-amber-600 flex-shrink-0" />
                        <label className="text-xs font-bold text-amber-900 whitespace-nowrap">Asignar Lote/Mz:</label>
                        <select
                          value={valorLoteSeleccionado(expedienteSeleccionado)}
                          onChange={(e) => setLotesEditando({ ...lotesEditando, [expedienteSeleccionado.id_proceso]: e.target.value })}
                          className="max-w-[18rem] bg-white text-xs font-bold text-amber-900 border border-amber-300 rounded px-2 py-1 focus:outline-none cursor-pointer"
                        >
                          <option value="">
                            {expedienteSeleccionado.id_lote ? 'Sin asignar (liberar lote)' : 'Seleccionar lote'}
                          </option>
                          {expedienteSeleccionado.id_lote &&
                            !lotesDisponibles.some((l) => l.id_lote === expedienteSeleccionado.id_lote) && (
                              <option value={String(expedienteSeleccionado.id_lote)}>
                                {expedienteSeleccionado.num_lote || `Lote #${expedienteSeleccionado.id_lote}`} (actual)
                              </option>
                            )}
                          {lotesDisponibles.map((l) => (
                            <option key={l.id_lote} value={String(l.id_lote)}>{etiquetaLote(l)}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={valorLoteSeleccionado(expedienteSeleccionado) === (expedienteSeleccionado.id_lote ? String(expedienteSeleccionado.id_lote) : '')}
                          onClick={(e) => handleAsignarLote(expedienteSeleccionado.id_proceso, e)}
                          className="bg-amber-600 hover:bg-amber-700 text-white p-1 rounded text-xs font-bold transition flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Save className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg shadow-sm">
                        <Home className="w-4 h-4 text-amber-600 flex-shrink-0" />
                        <span className="text-xs text-amber-900 font-bold">
                          Lote Asignado: <strong className="text-amber-700 font-extrabold">{expedienteSeleccionado.num_lote || 'Sin Asignar'}</strong>
                        </span>
                      </div>
                    )}

                    <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 px-3 py-1 rounded-lg shadow-sm">
                      <CreditCard className="w-4 h-4 text-blue-600" />
                      <label className="text-xs font-bold text-blue-900">Forma de pago:</label>
                      <select
                        value={expedienteSeleccionado.institucion_financiera || 'Sin asignar'}
                        onChange={(e) => handleCambiarProceso(expedienteSeleccionado.id_proceso, e.target.value)}
                        disabled={!esAdmin}
                        className="bg-transparent text-xs font-bold text-blue-700 focus:outline-none cursor-pointer border-b border-blue-300 disabled:border-none"
                      >
                        <option value="">Sin asignar</option>
                        {TIPOS_PROCESO_VENTA.map((tipo) => (
                          <option key={tipo} value={tipo}>{tipo}</option>
                        ))}
                      </select>
                    </div>

                    {esAdmin && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => handleAvanzarEtapa(expedienteSeleccionado, e)}
                          className="bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                        >
                          <ArrowRightCircle className="w-4 h-4" /> Autorizar Siguiente Etapa
                        </button>

                        <button
                          type="button"
                          onClick={(e) => handleEliminarExpediente(expedienteSeleccionado.id_proceso, e)}
                          className="bg-red-600 hover:bg-red-700 text-white p-2 rounded-lg transition shadow-sm cursor-pointer"
                          title="Eliminar Expediente"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {(() => {
                  const etapaActual = expedienteSeleccionado.etapa_actual || 'Evaluación';
                  const reglasEtapaActual = REGLAS_ETAPAS[etapaActual] || { docs: [], bins: [] };
                  const avanceEtapa = calcularProgresoEtapa(expedienteSeleccionado.rutas_documentos, expedienteSeleccionado.estados_binarios, reglasEtapaActual);
                  const documentosSubidos = expedienteSeleccionado.rutas_documentos ? Object.keys(expedienteSeleccionado.rutas_documentos) : [];
                  const estadosBinarios = expedienteSeleccionado.estados_binarios || {};
                  const docsFaltantes = reglasEtapaActual.docs.filter((doc) => !documentosSubidos.includes(doc));

                  return (
                    <>
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 shadow-inner">
                        <div className="flex flex-wrap justify-between items-center gap-2">
                          <div className="flex items-center gap-2.5">
                            <span className="relative flex h-3.5 w-3.5">
                              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${avanceEtapa.color} opacity-75`}></span>
                              <span className={`relative inline-flex rounded-full h-3.5 w-3.5 ${avanceEtapa.color}`}></span>
                            </span>

                            <span className="text-xs font-bold text-slate-700">
                              Estatus de la etapa ({etapaActual}):
                            </span>

                            <span className={`text-xs font-extrabold px-2.5 py-0.5 rounded-full border ${avanceEtapa.badgeColor}`}>
                              {avanceEtapa.texto}
                            </span>
                          </div>

                          <span className="text-xs font-bold text-slate-600">
                            {avanceEtapa.total > 0 
                              ? `${avanceEtapa.completados} de ${avanceEtapa.total} requisitos cumplidos (${avanceEtapa.porcentaje}%)`
                              : 'Etapa sin requisitos documentales'}
                          </span>
                        </div>

                        <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden shadow-inner">
                          <div
                            className={`h-full ${avanceEtapa.color} transition-all duration-500 ease-in-out`}
                            style={{ width: `${avanceEtapa.porcentaje}%` }}
                          />
                        </div>
                      </div>

                      <div>
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                          Etapa Actual: <span className="text-blue-700 font-bold">{etapaActual}</span>
                        </h4>

                        <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-9 gap-2">
                          {ETAPAS_VENTA.map((etapa, idx) => {
                            const esEtapaActual = etapaActual.toLowerCase() === etapa.toLowerCase();
                            return (
                              <div
                                key={etapa}
                                className={`p-2 rounded-lg text-center text-xs font-medium border transition-all ${
                                  esEtapaActual
                                    ? 'bg-blue-600 text-white border-blue-600 shadow-md font-bold scale-105'
                                    : 'bg-gray-50 text-gray-500 border-gray-200'
                                }`}
                              >
                                <div className="text-[10px] opacity-75">{idx + 1}.</div>
                                <div className="truncate">{etapa}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {reglasEtapaActual.bins.length > 0 && (
                        <div className="bg-purple-50 border border-purple-200 p-4 rounded-xl space-y-2">
                          <h4 className="text-xs font-bold text-purple-900 uppercase">
                            Estatus / Autorizaciones Requeridas para ({etapaActual}):
                          </h4>
                          <div className="flex flex-wrap gap-3">
                            {reglasEtapaActual.bins.map((reglaBinaria) => {
                              const estaCompletado = !!estadosBinarios[reglaBinaria];
                              return (
                                <button
                                  key={reglaBinaria}
                                  type="button"
                                  onClick={() => handleToggleEstadoBinario(expedienteSeleccionado, reglaBinaria)}
                                  disabled={!esAdmin}
                                  className={`flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-lg border transition ${
                                    estaCompletado 
                                      ? 'bg-emerald-600 text-white border-emerald-700' 
                                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                                  }`}
                                >
                                  {estaCompletado ? <CheckSquare className="w-4 h-4 text-white" /> : <Square className="w-4 h-4 text-gray-400" />}
                                  {reglaBinaria.replace(/_/g, ' ')}
                                  {!esAdmin && <span className="text-[10px] opacity-75">(Solo Admin)</span>}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-2">
                          <h4 className="text-xs font-bold text-gray-700 uppercase">
                            Documentos Recibidos:
                          </h4>
                          {documentosSubidos.length === 0 ? (
                            <p className="text-xs text-gray-400 italic">No se han adjuntado documentos aún.</p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {documentosSubidos.map((doc) => {
                                const rutaRelativa = expedienteSeleccionado.rutas_documentos[doc];
                                const urlCompleta = `${API_URL}${rutaRelativa}`;

                                return (
                                  <div 
                                    key={doc} 
                                    className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs px-3 py-1.5 rounded-lg shadow-sm"
                                  >
                                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                                    <span className="font-bold">{doc}</span>

                                    <a
                                      href={urlCompleta}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-0.5 rounded text-[10px] font-bold transition ml-1"
                                    >
                                      Ver <ExternalLink className="w-3 h-3" />
                                    </a>

                                    {esAdmin && (
                                      <button
                                        type="button"
                                        onClick={() => handleEliminarDocumento(expedienteSeleccionado.id_proceso, doc)}
                                        className="text-red-500 hover:text-red-700 p-0.5 rounded transition cursor-pointer ml-1"
                                        title="Eliminar / Rechazar documento"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        <div className="bg-amber-50/70 p-4 rounded-xl border border-amber-200 space-y-2">
                          <h4 className="text-xs font-bold text-amber-900 uppercase flex items-center gap-1.5">
                            <FileText className="w-4 h-4 text-amber-600" />
                            Documentos Faltantes ({etapaActual}):
                          </h4>
                          {docsFaltantes.length === 0 ? (
                            <p className="text-xs text-emerald-700 font-medium">¡Sin documentos pendientes en esta fase!</p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {docsFaltantes.map((doc) => (
                                <div key={doc} className="inline-flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-amber-300 text-xs shadow-sm">
                                  <span className="font-bold text-amber-900">{doc}</span>
                                  {EJEMPLOS_DOCUMENTOS[doc] && (
                                    <a
                                      href={EJEMPLOS_DOCUMENTOS[doc]}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-[10px] bg-amber-100 hover:bg-amber-200 text-amber-800 px-2 py-0.5 rounded font-bold transition"
                                    >
                                      Ejemplo <ExternalLink className="w-3 h-3" />
                                    </a>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* BITÁCORA DE OBSERVACIONES Y MENSAJES */}
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                        <h4 className="text-xs font-bold text-slate-800 uppercase flex items-center gap-1.5">
                          <MessageSquare className="w-4 h-4 text-blue-600" /> Bitácora de Observaciones y Mensajes
                        </h4>

                        <div className="bg-white border rounded-lg p-3 text-xs text-gray-700 whitespace-pre-wrap max-h-36 overflow-y-auto font-mono">
                          {expedienteSeleccionado.observaciones || 'No hay avisos ni observaciones registradas.'}
                        </div>

                        <div className="flex gap-2 pt-1">
                          <input
                            type="text"
                            placeholder={esAdmin ? "Escribir un mensaje u observación para el cliente..." : "Escribir un mensaje o consulta para el asesor..."}
                            value={comentarioTexto[expedienteSeleccionado.id_proceso] || ''}
                            onChange={(e) => setComentarioTexto({ ...comentarioTexto, [expedienteSeleccionado.id_proceso]: e.target.value })}
                            className="flex-1 px-3 py-2 border rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleEnviarComentario(expedienteSeleccionado.id_proceso)}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                          >
                            <Send className="w-3.5 h-3.5" /> Enviar Mensaje
                          </button>
                        </div>
                      </div>

                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                        <h4 className="text-xs font-bold text-gray-700 uppercase flex items-center gap-1">
                          <FileUp className="w-4 h-4 text-blue-600" /> Adjuntar Requisito Documental
                        </h4>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <select
                            value={tipoDocumento}
                            onChange={(e) => setTipoDocumento(e.target.value)}
                            className="text-xs p-2.5 border rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer"
                          >
                            {reglasEtapaActual.docs.map((docKey) => (
                              <option key={docKey} value={docKey}>{docKey}</option>
                            ))}
                            <option value="OTRO">Otro Documento de Respaldo</option>
                          </select>

                          <input
                            type="file"
                            onChange={(e) => setArchivoSeleccionado(e.target.files[0])}
                            className="text-xs text-gray-500 file:mr-2 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-100 file:text-blue-700 hover:file:bg-blue-200 cursor-pointer bg-white border rounded-lg p-1"
                          />

                          <button
                            type="button"
                            onClick={() => handleSubirArchivo(expedienteSeleccionado.id_proceso)}
                            disabled={procesoIdSubiendo === expedienteSeleccionado.id_proceso}
                            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 rounded-lg transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                          >
                            {procesoIdSubiendo === expedienteSeleccionado.id_proceso ? 'Subiendo...' : 'Subir Documento'}
                          </button>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {/* CONTENIDO DE LA PESTAÑA 2: INFORMACIÓN DEL EXPEDIENTE */}
            {pestanaActivaModal === 'informacion' && (
              <div className="space-y-6 animate-fadeIn">
                <div className="flex flex-wrap justify-between items-start gap-4 border-b pb-4">
                  <div>
                    <h2 className="text-2xl font-extrabold text-gray-900">
                      {datosPersonaExpediente?.nombre
                        ? datosPersonaExpediente.nombre
                        : 'Desarrollos Urbanos del Norte S.A. de C.V.'}
                    </h2>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-600">
                      <span className="font-bold text-amber-900">
                        {expedienteSeleccionado.folio || 
                          `EXP-${expedienteSeleccionado.fecha_registro 
                            ? new Date(expedienteSeleccionado.fecha_registro).getFullYear() 
                            : new Date().getFullYear()}-${expedienteSeleccionado.id_proceso}`}
                      </span>
                      <span className="bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full font-bold">
                        {expedienteSeleccionado.estatus || 'Activo'}
                      </span>
                      <span className="bg-gray-100 text-gray-700 px-2.5 py-0.5 rounded-full font-bold">
                        Tipo de expediente: {esExpedienteTercero ? 'Tercero' : 'Cliente'}
                      </span>
                      <span>
                        Registrado el {formatearFecha(expedienteSeleccionado.fecha_registro)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Datos del Cliente (si el expediente es de tercero, muestra los datos del tercero) */}
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="bg-[#eae6df] px-5 py-3 border-b border-gray-200 flex justify-between items-center">
                      <h3 className="font-bold text-gray-800 text-sm">Datos del Cliente</h3>
                      <button
                        type="button"
                        onClick={(e) => handleAbrirModalEditar(expedienteSeleccionado, e)}
                        className="text-xs font-bold text-amber-800 hover:text-amber-900 flex items-center gap-1 cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Editar
                      </button>
                    </div>
                    <div className="p-5 space-y-4 text-xs">
                      <div>
                        <span className="text-gray-400 font-bold uppercase block text-[10px]">CORREO ELECTRÓNICO</span>
                        <span className="font-bold text-gray-800">
                          {datosPersonaExpediente?.email || 'Sin registrar'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400 font-bold uppercase block text-[10px]">TELÉFONO</span>
                        <span className="font-bold text-gray-800">
                          {datosPersonaExpediente?.telefono || 'Sin teléfono registrado'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400 font-bold uppercase block text-[10px]">CURP</span>
                        <span className="font-bold text-gray-800">
                          {datosPersonaExpediente?.curp || 'Sin CURP registrada'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400 font-bold uppercase block text-[10px]">RFC</span>
                        <span className="font-bold text-gray-800">
                          {datosPersonaExpediente?.rfc || 'Sin RFC registrado'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400 font-bold uppercase block text-[10px]">DIRECCIÓN</span>
                        <span className="font-bold text-gray-800">
                          {datosPersonaExpediente?.direccion || 'Sin dirección registrada'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400 font-bold uppercase block text-[10px]">LOTE / MANZANA</span>
                        <span className="font-bold text-gray-800">
                          {expedienteSeleccionado.num_lote || 'Sin Asignar'}
                          {expedienteSeleccionado.num_lote && expedienteSeleccionado.lote_estado ? ` · ${expedienteSeleccionado.lote_estado}` : ''}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Datos del Proyecto y Gestión */}
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="bg-[#eae6df] px-5 py-3 border-b border-gray-200">
                      <h3 className="font-bold text-gray-800 text-sm">Datos del Proyecto y Gestión</h3>
                    </div>
                    <div className="p-5 space-y-4 text-xs">
                      <div>
                        <span className="text-gray-400 font-bold uppercase block text-[10px]">FECHA DE INICIO</span>
                        <span className="font-bold text-gray-800">
                          {formatearFecha(expedienteSeleccionado.fecha_inicio || expedienteSeleccionado.fecha_registro)}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400 font-bold uppercase block text-[10px]">FECHA DE TÉRMINO</span>
                        <span className="font-bold text-gray-800">
                          {expedienteSeleccionado.estatus?.toLowerCase() === 'cerrado' || expedienteSeleccionado.etapa_actual?.toLowerCase() === 'entrega'
                            ? formatearFecha(expedienteSeleccionado.fecha_termino || expedienteSeleccionado.fecha_actualizacion)
                            : '(Pendiente / En proceso)'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400 font-bold uppercase block text-[10px]">CATEGORÍA</span>
                        <span className="font-bold text-gray-800">{expedienteSeleccionado.tipo_construccion || 'Sin asignar'}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 font-bold uppercase block text-[10px]">FORMA DE PAGO</span>
                        <span className="font-bold text-gray-800">{expedienteSeleccionado.institucion_financiera || 'Sin asignar'}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 font-bold uppercase block text-[10px]">ETAPA ACTUAL</span>
                        <span className="font-bold text-gray-800">{expedienteSeleccionado.etapa_actual || 'Evaluación'}</span>
                      </div>
                    </div>
                  </div>

                </div>

                {/* TABLA DE AUDITORÍA DE DOCUMENTOS (EXCLUSIVO ADMINISTRADOR) */}
                {esAdmin && (() => {
                  const etapaActual = expedienteSeleccionado.etapa_actual || 'Evaluación';
                  const reqEtapa = REGLAS_ETAPAS[etapaActual] || { docs: [] };
                  const docsSubidosObj = expedienteSeleccionado.rutas_documentos || {};
                  
                  const todosLosDocumentos = Array.from(
                    new Set([...reqEtapa.docs, ...Object.keys(docsSubidosObj)])
                  );

                  return (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                      <div className="bg-slate-800 px-5 py-3 border-b border-slate-700 flex justify-between items-center">
                        <h3 className="font-bold text-white text-sm flex items-center gap-2">
                          <ShieldAlert className="w-4 h-4 text-purple-400" /> AUDITORÍA DE DOCUMENTACIÓN (SOLO ADMIN)
                        </h3>
                        <span className="text-[10px] bg-purple-900/80 text-purple-200 px-2.5 py-0.5 rounded-full font-semibold border border-purple-500/30">
                          Etapa actual: {etapaActual}
                        </span>
                      </div>

                      <div className="p-4 bg-purple-50/50 border-b border-purple-100 text-xs text-purple-900">
                        Esta tabla permite al equipo administrativo verificar de manera rápida el estatus de los documentos exigidos para la etapa en curso.
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead className="bg-gray-50 text-gray-600 font-bold uppercase text-[10px] tracking-wider border-b border-gray-200">
                            <tr>
                              <th className="p-3">Nombre del Documento</th>
                              <th className="p-3">Estatus</th>
                              <th className="p-3">Etapa Requerida</th>
                              <th className="p-3 text-center">Acción / Descarga</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {todosLosDocumentos.length === 0 ? (
                              <tr>
                                <td colSpan="4" className="p-4 text-center text-gray-400 italic">
                                  Esta etapa no requiere documentos específicos.
                                </td>
                              </tr>
                            ) : (
                              todosLosDocumentos.map((docKey) => {
                                const adjuntado = !!docsSubidosObj[docKey];
                                const esDeEtapaActual = reqEtapa.docs.includes(docKey);
                                const rutaRelativa = docsSubidosObj[docKey];

                                return (
                                  <tr key={docKey} className="hover:bg-gray-50/80 transition">
                                    <td className="p-3 font-bold text-gray-800">
                                      {docKey.replace(/_/g, ' ')}
                                    </td>
                                    <td className="p-3">
                                      {adjuntado ? (
                                        <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 font-bold px-2.5 py-0.5 rounded-full text-[11px]">
                                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Adjuntado
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 font-bold px-2.5 py-0.5 rounded-full text-[11px]">
                                          <AlertCircle className="w-3.5 h-3.5 text-amber-600" /> Faltante
                                        </span>
                                      )}
                                    </td>
                                    <td className="p-3 font-medium text-gray-600">
                                      {esDeEtapaActual ? (
                                        <span className="text-blue-700 font-semibold">{etapaActual}</span>
                                      ) : (
                                        <span className="text-gray-400">Etapas Previas / Adicional</span>
                                      )}
                                    </td>
                                    <td className="p-3 text-center">
                                      {adjuntado ? (
                                        <div className="flex items-center justify-center gap-2">
                                          <a
                                            href={`${API_URL}${rutaRelativa}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-2.5 py-1 rounded text-[10px] inline-flex items-center gap-1 transition shadow-sm"
                                          >
                                            Ver Documento <ExternalLink className="w-3 h-3" />
                                          </a>
                                          <button
                                            type="button"
                                            onClick={() => handleEliminarDocumento(expedienteSeleccionado.id_proceso, docKey)}
                                            className="text-red-500 hover:text-red-700 p-1 rounded transition cursor-pointer"
                                            title="Eliminar / Rechazar documento"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      ) : (
                                        <span className="text-gray-400 text-[11px] italic">Pendiente de envío por el cliente</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}

              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
}