import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './components/Login';
import { PersonalPage } from './modules/personal/PersonalPage';
import { VacacionesPage } from './modules/vacaciones/VacacionesPage';
import { RHPage } from './modules/rh/RHPage';
import { AsistenciaPage } from './modules/asistencia/AsistenciaPage';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <Layout>
              <div>
                <h1>Dashboard</h1>
                <p>Bienvenido al Sistema de Gestión Interna</p>
              </div>
            </Layout>
          }
        />
        <Route
          path="/personal"
          element={
            <Layout>
              <PersonalPage />
            </Layout>
          }
        />
        <Route
          path="/vacaciones"
          element={
            <Layout>
              <VacacionesPage />
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
