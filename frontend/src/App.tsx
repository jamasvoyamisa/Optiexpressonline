import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Login } from './components/Login';
import { RHPage } from './modules/rh/RHPage';
import { ConfiguracionPage } from './modules/configuracion/ConfiguracionPage';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Navigate to="/rh" replace />} />
        <Route
          path="/rh"
          element={
            <Layout>
              <RHPage />
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
        <Route path="*" element={<Navigate to="/rh" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
