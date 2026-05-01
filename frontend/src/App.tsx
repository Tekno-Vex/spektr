import { Routes, Route } from 'react-router-dom'
import { UploadZone } from './components/UploadZone'
import { ResultsPage } from './components/ResultsPage'
import { LoginPage } from './components/LoginPage'
import { RegisterPage } from './components/RegisterPage'
import { DashboardPage } from './components/DashboardPage'
import './App.css'

function App() {
  return (
    <Routes>
      <Route path="/" element={<UploadZone />} />
      <Route path="/results/:analysisId" element={<ResultsPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
    </Routes>
  )
}

export default App