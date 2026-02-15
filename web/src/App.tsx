import { useState, useEffect } from 'react'
import './App.css'

// Import WASM module
import init, { Card, CardNumber, CardShape, LuckCalculator, simulate, version } from './wasm/pokercraft_wasm'

function App() {
  const [wasmReady, setWasmReady] = useState(false)
  const [wasmVersion, setWasmVersion] = useState('')
  const [cardDemo, setCardDemo] = useState('')
  const [luckDemo, setLuckDemo] = useState('')
  const [simulateDemo, setSimulateDemo] = useState('')

  useEffect(() => {
    init().then(() => {
      setWasmReady(true)
      setWasmVersion(version())
    })
  }, [])

  const runCardDemo = () => {
    try {
      const card = new Card('As')
      const info = `Card: ${card.toString()}, Shape: ${CardShape[card.shape]}, Number: ${CardNumber[card.number]}`
      card.free()
      setCardDemo(info)
    } catch (e) {
      setCardDemo(`Error: ${e}`)
    }
  }

  const runLuckDemo = () => {
    try {
      const calc = new LuckCalculator()
      // Simulate some poker hands: equity vs actual result
      calc.addResult(0.8, 1.0) // 80% favorite, won
      calc.addResult(0.3, 0.0) // 30% underdog, lost
      calc.addResult(0.5, 1.0) // 50-50, won
      calc.addResult(0.7, 1.0) // 70% favorite, won

      const score = calc.luckScore()
      calc.free()
      setLuckDemo(`Luck Score: ${score.toFixed(4)} (positive = running good)`)
    } catch (e) {
      setLuckDemo(`Error: ${e}`)
    }
  }

  const runSimulateDemo = () => {
    try {
      // Simulate bankroll with:
      // - Initial capital: 100 units
      // - Returns: mix of wins (+10) and losses (-5)
      // - 1000 iterations per simulation
      // - Exit at 2x profit
      // - Run 1000 simulations
      const returns = new Float64Array([10, 10, 10, -5, -5, -5, -5, 15, -10, 5])
      const result = simulate(100, returns, 1000, 2.0, 1000)

      const info = `Simulations: ${result.length}
Bankruptcy Rate: ${(result.bankruptcyRate * 100).toFixed(2)}%
Survival Rate: ${(result.survivalRate * 100).toFixed(2)}%
Profitable Rate: ${(result.profitableRate * 100).toFixed(2)}%`

      result.free()
      setSimulateDemo(info)
    } catch (e) {
      setSimulateDemo(`Error: ${e}`)
    }
  }

  if (!wasmReady) {
    return <div>Loading WASM module...</div>
  }

  return (
    <div className="app">
      <h1>Pokercraft Local - Web</h1>
      <p>WASM Version: {wasmVersion}</p>

      <div className="demo-section">
        <h2>Card Demo</h2>
        <button onClick={runCardDemo}>Create Ace of Spades</button>
        {cardDemo && <pre>{cardDemo}</pre>}
      </div>

      <div className="demo-section">
        <h2>Luck Calculator Demo</h2>
        <button onClick={runLuckDemo}>Calculate Luck Score</button>
        {luckDemo && <pre>{luckDemo}</pre>}
      </div>

      <div className="demo-section">
        <h2>Bankroll Simulation Demo</h2>
        <button onClick={runSimulateDemo}>Run Simulation</button>
        {simulateDemo && <pre>{simulateDemo}</pre>}
      </div>
    </div>
  )
}

export default App
