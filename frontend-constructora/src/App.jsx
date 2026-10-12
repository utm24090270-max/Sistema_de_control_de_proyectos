import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, AuthContext } from './context/AuthContext';
import { useContext } from 'react';
import Login from './pages/Login';
import Expedientes from './pages/Expedientes';
import Inventario from './pages/Inventario';

const RutaProtegida = ({ children }) => {
  const { usuario, cargando } = useContext(AuthContext);
  if (cargando) return null;
  return usuario ? children : <Navigate to="/login" />;
};

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/expedientes"
            element={
              <RutaProtegida>
                <Expedientes />
              </RutaProtegida>
            }
          />
          <Route
            path="/inventario"
            element={
              <RutaProtegida>
                <Inventario />
              </RutaProtegida>
            }
          />
          <Route path="*" element={<Navigate to="/expedientes" />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}