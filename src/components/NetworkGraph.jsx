/**
 * NetworkGraph — Pure SVG network graph, zero new npm deps.
 *
 * 3-column layout: councillor nodes → company nodes → supplier nodes.
 * Lines coloured by severity. Click to highlight, hover for details.
 *
 * Props:
 *   councillorName {string} - Central councillor
 *   companies {array} - [{name, company_number, active, supplier_match, co_directors}]
 *   suppliers {array} - [{name, spend}]
 *   coDirectors {array} - [{name, shared_companies}]
 *   width {number} - SVG width
 *   height {number} - SVG height
 */
import { useState, useMemo } from 'react'

const COLORS = {
  councillor: '#f97316',
  company: '#a855f7',
  supplier: '#22c55e',
  coDirector: '#3b82f6',
  line: '#475569',
  lineConflict: '#ef4444',
  lineActive: '#f59e0b',
  bg: 'rgba(15, 23, 42, 0.8)',
  text: '#e2e8f0',
  textMuted: '#94a3b8',
}

function truncate(text, maxLen = 22) {
  if (!text) return ''
  return text.length > maxLen ? text.substring(0, maxLen) + '...' : text
}

export default function NetworkGraph({
  councillorName = 'Councillor',
  companies = [],
  suppliers = [],
  coDirectors = [],
  width = 700,
  height = 400,
}) {
  const [hoveredNode, setHoveredNode] = useState(null)

  // Layout columns
  const colX = useMemo(() => ({
    councillor: width * 0.08,
    coDirector: width * 0.08,
    company: width * 0.45,
    supplier: width * 0.82,
  }), [width])

  // Position nodes
  const nodes = useMemo(() => {
    const n = []

    // Councillor (center-left)
    n.push({
      id: 'councillor',
      type: 'councillor',
      label: councillorName,
      x: colX.councillor,
      y: height * 0.3,
      color: COLORS.councillor,
    })

    // Companies (middle column)
    const companyCount = Math.min(companies.length, 8)
    const companySpacing = Math.max(40, (height - 40) / Math.max(companyCount, 1))
    for (let i = 0; i < companyCount; i++) {
      const comp = companies[i]
      n.push({
        id: `company-${i}`,
        type: 'company',
        label: comp.company_name || comp.name,
        x: colX.company,
        y: 20 + i * companySpacing + companySpacing / 2,
        color: comp.supplier_match ? COLORS.lineConflict : COLORS.company,
        data: comp,
      })
    }

    // Suppliers (right column)
    const supplierCount = Math.min(suppliers.length, 6)
    const supplierSpacing = Math.max(50, (height - 40) / Math.max(supplierCount, 1))
    for (let i = 0; i < supplierCount; i++) {
      const sup = suppliers[i]
      n.push({
        id: `supplier-${i}`,
        type: 'supplier',
        label: sup.name || sup,
        x: colX.supplier,
        y: 30 + i * supplierSpacing + supplierSpacing / 2,
        color: COLORS.supplier,
        data: sup,
      })
    }

    // Co-directors (below councillor)
    const cdCount = Math.min(coDirectors.length, 5)
    for (let i = 0; i < cdCount; i++) {
      const cd = coDirectors[i]
      n.push({
        id: `codirector-${i}`,
        type: 'coDirector',
        label: cd.name,
        x: colX.coDirector,
        y: height * 0.55 + i * 35,
        color: COLORS.coDirector,
        data: cd,
      })
    }

    return n
  }, [councillorName, companies, suppliers, coDirectors, colX, height])

  // Build edges
  const edges = useMemo(() => {
    const e = []
    const councillorNode = nodes.find(n => n.id === 'councillor')
    if (!councillorNode) return e

    // Councillor → Companies
    nodes.filter(n => n.type === 'company').forEach(compNode => {
      e.push({
        from: councillorNode,
        to: compNode,
        color: compNode.data?.supplier_match ? COLORS.lineConflict : COLORS.line,
        dashed: !!compNode.data?.resigned_on,
      })
    })

    // Companies → Suppliers (if supplier_match)
    nodes.filter(n => n.type === 'company').forEach(compNode => {
      if (compNode.data?.supplier_match) {
        const matchingSupplier = nodes.find(
          n => n.type === 'supplier' &&
          (n.label?.toLowerCase() === compNode.data.supplier_match?.toLowerCase() ||
           n.label?.toLowerCase().includes(compNode.data.supplier_match?.toLowerCase()?.substring(0, 10)))
        )
        if (matchingSupplier) {
          e.push({
            from: compNode,
            to: matchingSupplier,
            color: COLORS.lineConflict,
          })
        }
      }
    })

    // Co-directors → Companies they share
    nodes.filter(n => n.type === 'coDirector').forEach(cdNode => {
      // Connect to first company (simplified)
      const firstCompany = nodes.find(n => n.type === 'company')
      if (firstCompany) {
        e.push({
          from: cdNode,
          to: firstCompany,
          color: COLORS.coDirector,
          dashed: true,
        })
      }
    })

    return e
  }, [nodes])

  return (
    <div className="network-graph" style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        style={{
          maxHeight: height,
          background: COLORS.bg,
          borderRadius: '10px',
          border: '1px solid var(--border-color, #334155)',
        }}
      >
        {/* Edges */}
        {edges.map((edge, i) => (
          <line
            key={`edge-${i}`}
            x1={edge.from.x}
            y1={edge.from.y}
            x2={edge.to.x}
            y2={edge.to.y}
            stroke={edge.color}
            strokeWidth={1.5}
            strokeDasharray={edge.dashed ? '4,4' : 'none'}
            opacity={hoveredNode && hoveredNode !== edge.from.id && hoveredNode !== edge.to.id ? 0.2 : 0.6}
          />
        ))}

        {/* Nodes */}
        {nodes.map(node => {
          const isHovered = hoveredNode === node.id
          const dimmed = hoveredNode && !isHovered
          return (
            <g
              key={node.id}
              onMouseEnter={() => setHoveredNode(node.id)}
              onMouseLeave={() => setHoveredNode(null)}
              style={{ cursor: 'pointer' }}
              opacity={dimmed ? 0.3 : 1}
            >
              <circle
                cx={node.x}
                cy={node.y}
                r={node.type === 'councillor' ? 10 : 7}
                fill={node.color}
                stroke={isHovered ? '#fff' : 'none'}
                strokeWidth={2}
              />
              <text
                x={node.x + (node.type === 'supplier' ? -10 : 14)}
                y={node.y + 4}
                fill={COLORS.text}
                fontSize="9"
                fontFamily="Inter, sans-serif"
                textAnchor={node.type === 'supplier' ? 'end' : 'start'}
              >
                {truncate(node.label)}
              </text>
            </g>
          )
        })}

        {/* Legend */}
        <g transform={`translate(${width - 130}, ${height - 75})`}>
          <rect x={-5} y={-5} width={130} height={70} rx={6} fill="rgba(0,0,0,0.4)" />
          {[
            { color: COLORS.councillor, label: 'Councillor' },
            { color: COLORS.company, label: 'Company' },
            { color: COLORS.supplier, label: 'Supplier' },
            { color: COLORS.coDirector, label: 'Co-Director' },
          ].map((item, i) => (
            <g key={i} transform={`translate(5, ${i * 15 + 8})`}>
              <circle cx={5} cy={0} r={4} fill={item.color} />
              <text x={14} y={3} fill={COLORS.textMuted} fontSize="8" fontFamily="Inter, sans-serif">
                {item.label}
              </text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  )
}
