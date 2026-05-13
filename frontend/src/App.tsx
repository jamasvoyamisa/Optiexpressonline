import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { Layout } from './components/Layout';
import { Login } from './components/Login';
import { ProtectedRoute } from './components/ProtectedRoute';
import { DashboardPage } from './modules/dashboard/DashboardPage';
import { RHPage } from './modules/rh/RHPage';
import { AsistenciaPage } from './modules/asistencia/AsistenciaPage';
import { MiAreaPage } from './modules/mi-area/MiAreaPage';
import ChecadasEspecialesPage from './modules/mi-area/ChecadasEspecialesPage';
import { SolicitudesVacacionesAprobarPage } from './modules/vacaciones/SolicitudesVacacionesAprobarPage';
import { ConfiguracionPage } from './modules/configuracion/ConfiguracionPage';
import { SoporteTicketsPage } from './modules/soporte/SoporteTicketsPage';
import { MisAsistenciasPage } from './modules/empleado/MisAsistenciasPage';
import { MisVacacionesPage } from './modules/empleado/MisVacacionesPage';
import { MisPrestamosPage } from './modules/empleado/MisPrestamosPage';
import { MisDatosPage } from './modules/empleado/MisDatosPage';
import { HomeRedirect } from './components/HomeRedirect';
import { NominaPage } from './modules/nomina/NominaPage';
import { isNominaEnabled } from './config/features';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><HomeRedirect /></ProtectedRoute>} />
          <Route
            path="/mis-asistencias"
            element={
              <ProtectedRoute>
                <Layout>
                  <MisAsistenciasPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/mis-vacaciones"
            element={
              <ProtectedRoute>
                <Layout>
                  <MisVacacionesPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/mis-prestamos"
            element={
              <ProtectedRoute>
                <Layout>
                  <MisPrestamosPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/mis-datos"
            element={
              <ProtectedRoute>
                <Layout>
                  <MisDatosPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute require="dashboard">
                <Layout>
                  <DashboardPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/rh"
            element={
              <ProtectedRoute require="rh">
                <Layout>
                  <RHPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/asistencia"
            element={
              <ProtectedRoute require="superuser">
                <Layout>
                  <AsistenciaPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/mi-area"
            element={
              <ProtectedRoute require="mi_area">
                <Layout>
                  <MiAreaPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/mi-area/checadas-especiales"
            element={
              <ProtectedRoute require="superuser">
                <Layout>
                  <ChecadasEspecialesPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/solicitudes-vacaciones"
            element={
              <ProtectedRoute require="solicitudes_vacaciones">
                <Layout>
                  <SolicitudesVacacionesAprobarPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/configuracion"
            element={
              <ProtectedRoute require="configuracion">
                <Layout>
                  <ConfiguracionPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/soporte"
            element={
              <ProtectedRoute require="soporte">
                <Layout>
                  <SoporteTicketsPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          {isNominaEnabled && (
            <Route
              path="/nomina"
              element={
                <ProtectedRoute require="superuser">
                  <Layout>
                    <NominaPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
          )}
          <Route path="*" element={<ProtectedRoute><HomeRedirect /></ProtectedRoute>} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
