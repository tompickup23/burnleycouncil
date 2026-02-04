import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import News from './pages/News'
import Spending from './pages/Spending'
import Budgets from './pages/Budgets'
import Politics from './pages/Politics'
import MyArea from './pages/MyArea'
import './App.css'

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/news" element={<News />} />
          <Route path="/spending" element={<Spending />} />
          <Route path="/budgets" element={<Budgets />} />
          <Route path="/politics" element={<Politics />} />
          <Route path="/my-area" element={<MyArea />} />
        </Routes>
      </Layout>
    </Router>
  )
}

export default App
