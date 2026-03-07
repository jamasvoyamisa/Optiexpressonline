import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { Layout } from './components/Layout';
import { Login } from './components/Login';
import { RHPage } from './modules/rh/RHPage';
import { AsistenciaPage } from './modules/asistencia/AsistenciaPage';
import { MiAreaPage } from './modules/mi-area/MiAreaPage';
import { ConfiguracionPage } from './modules/configuracion/ConfiguracionPage';
import { MisAsistenciasPage } from './modules/empleado/MisAsistenciasPage';
import { MisVacacionesPage } from './modules/empleado/MisVacacionesPage';
import { MisDatosPage } from './modules/empleado/MisDatosPage';
import { HomeRedirect } from './components/HomeRedirect';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<HomeRedirect />} />
        <Route
          path="/mis-asistencias"
          element={
            <Layout>
              <MisAsistenciasPage />
            </Layout>
          }
        />
        <Route
          path="/mis-vacaciones"
          element={
            <Layout>
              <MisVacacionesPage />
            </Layout>
          }
        />
        <Route
          path="/mis-datos"
          element={
            <Layout>
              <MisDatosPage />
            </Layout>
          }
        />
        <Route
          path="/rh"
          element={
            <Layout>
              <RHPage />
            </Layout>
          }
        />
        <Route
          path="/asistencia"
          element={
            <Layout>
              <AsistenciaPage />
            </Layout>
          }
        />
        <Route
          path="/mi-area"
          element={
            <Layout>
              <MiAreaPage />
            </Layout>
          }
        />
        <Route
          path="/configuracion"
          element={
            <Layout>
              <ConfiguracionPage />
            </Layout>
          }
        />
        <Route path="*" element={<Navigate to="/mis-asistencias" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
