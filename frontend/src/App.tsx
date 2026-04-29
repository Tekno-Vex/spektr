import { Routes, Route } from 'react-router-dom'
import { UploadZone } from './components/UploadZone'
import { ResultsPage } from './components/ResultsPage'
import './App.css'

function App() {
  return (
    <Routes>
      <Route path="/" element={<UploadZone />} />
      <Route path="/results/:analysisId" element={<ResultsPage />} />
    </Routes>
  )
}

export default App