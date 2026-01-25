import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { motion } from 'framer-motion';
import { RefreshCw, ZoomIn, ZoomOut, Maximize2, Minimize2, X, RotateCcw } from 'lucide-react';
import { useTheme } from '../../context';

// ============================================
// TYPES
// ============================================

export interface GraphNode {
  id: string;
  vpa: string;
  name?: string;
  isCurrentUser?: boolean;
  totalSent?: number;
  totalReceived?: number;
  transactionCount?: number;
}

export interface GraphLink {
  source: string;
  target: string;
  amount: number;
  count: number;
  txnId: string;
  direction: 'CREDIT' | 'DEBIT';
  timestamp: string;
  riskScore: number;
}

export interface TransactionGraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

// Raw transaction from API
export interface RawTransaction {
  ledgerId: number;
  globalTxnId: string;
  accountNumber: string;
  amount: number;
  direction: 'CREDIT' | 'DEBIT';
  counterpartyVpa: string;
  balanceAfter: number;
  riskScore: number;
  createdAt: string;
}

interface NetworkGraphProps {
  transactions: RawTransaction[];
  isLoading?: boolean;
  onRefresh?: () => void;
  currentUserVpa?: string;
}

// D3 Simulation types
interface SimulationNode extends d3.SimulationNodeDatum, GraphNode {
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
  radius: number;
}

interface SimulationLink extends d3.SimulationLinkDatum<SimulationNode> {
  amount: number;
  count: number;
  txnId: string;
  direction: 'CREDIT' | 'DEBIT';
  timestamp: string;
  riskScore: number;
  index?: number;
}

// ============================================
// TRANSFORM TRANSACTIONS TO GRAPH DATA
// ============================================

const transformTransactionsToGraph = (
  transactions: RawTransaction[],
  currentUserVpa?: string
): TransactionGraphData => {
  if (!transactions || transactions.length === 0) {
    return { nodes: [], links: [] };
  }

  const nodesMap = new Map<string, GraphNode>();
  const links: GraphLink[] = [];

  // Add current user as a node
  const userVpa = currentUserVpa || 'you@upi';
  nodesMap.set(userVpa, {
    id: userVpa,
    vpa: userVpa,
    name: 'You',
    isCurrentUser: true,
    totalSent: 0,
    totalReceived: 0,
    transactionCount: 0,
  });

  // Process each transaction - create individual links for each
  transactions.forEach((txn) => {
    const counterparty = txn.counterpartyVpa;

    // Add counterparty node if not exists
    if (!nodesMap.has(counterparty)) {
      nodesMap.set(counterparty, {
        id: counterparty,
        vpa: counterparty,
        name: counterparty.split('@')[0],
        isCurrentUser: false,
        totalSent: 0,
        totalReceived: 0,
        transactionCount: 0,
      });
    }

    // Update node stats
    const userNode = nodesMap.get(userVpa)!;
    const counterpartyNode = nodesMap.get(counterparty)!;

    if (txn.direction === 'DEBIT') {
      // User sent money
      userNode.totalSent = (userNode.totalSent || 0) + txn.amount;
      counterpartyNode.totalReceived = (counterpartyNode.totalReceived || 0) + txn.amount;
    } else {
      // User received money
      userNode.totalReceived = (userNode.totalReceived || 0) + txn.amount;
      counterpartyNode.totalSent = (counterpartyNode.totalSent || 0) + txn.amount;
    }

    userNode.transactionCount = (userNode.transactionCount || 0) + 1;
    counterpartyNode.transactionCount = (counterpartyNode.transactionCount || 0) + 1;

    // Create individual link for each transaction
    links.push({
      source: txn.direction === 'DEBIT' ? userVpa : counterparty,
      target: txn.direction === 'DEBIT' ? counterparty : userVpa,
      amount: txn.amount,
      count: 1,
      txnId: txn.globalTxnId,
      direction: txn.direction,
      timestamp: txn.createdAt,
      riskScore: txn.riskScore,
    });
  });

  return {
    nodes: Array.from(nodesMap.values()),
    links: links,
  };
};

// ============================================
// NETWORK GRAPH COMPONENT
// ============================================

export const NetworkGraph = ({
  transactions,
  isLoading = false,
  onRefresh,
  currentUserVpa
}: NetworkGraphProps) => {
  // Get theme from context
  const { isDark } = useTheme();

  // Transform transactions to graph data
  const data = transformTransactionsToGraph(transactions || [], currentUserVpa);

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 500 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  // Update dimensions on resize or fullscreen change
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        setDimensions({ width: width || 600, height: height || 500 });
      }
    };

    // Small delay to allow fullscreen transition
    const timeoutId = setTimeout(updateDimensions, 100);
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => {
      window.removeEventListener('resize', updateDimensions);
      clearTimeout(timeoutId);
    };
  }, [isFullscreen]);

  // ESC key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };

    if (isFullscreen) {
      document.addEventListener('keydown', handleKeyDown);
      // Prevent body scroll in fullscreen
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isFullscreen]);

  // D3 Graph rendering
  useEffect(() => {
    if (!svgRef.current || !data.nodes.length) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const { width, height } = dimensions;
    const centerX = width / 2;
    const centerY = height / 2;

    // Theme-aware colors (uses isDark from context)
    const colors = {
      nodeFill: isDark ? '#1e293b' : '#e2e8f0',
      nodeStroke: isDark ? '#475569' : '#94a3b8',
      nodeLabel: isDark ? '#e2e8f0' : '#1e293b',
      nodeSecondaryLabel: isDark ? '#64748b' : '#94a3b8',
      tooltipBg: isDark ? '#1e293b' : '#ffffff',
      tooltipBorder: isDark ? '#475569' : '#e2e8f0',
      tooltipText: isDark ? '#94a3b8' : '#64748b',
    };

    // Create nodes and links data for simulation
    const nodes: SimulationNode[] = data.nodes.map(n => ({
      ...n,
      isCurrentUser: n.vpa === currentUserVpa,
      radius: n.vpa === currentUserVpa ? 25 : 20
    }));

    const links: SimulationLink[] = data.links.map((l, i) => ({
      source: l.source,
      target: l.target,
      amount: l.amount,
      count: l.count,
      txnId: l.txnId,
      direction: l.direction,
      timestamp: l.timestamp,
      riskScore: l.riskScore,
      index: i
    }));

    // Group links by source-target pair to calculate curve offsets
    const linkGroups = new Map<string, SimulationLink[]>();
    links.forEach(link => {
      const key = [link.source, link.target].sort().join('-');
      if (!linkGroups.has(key)) {
        linkGroups.set(key, []);
      }
      linkGroups.get(key)!.push(link);
    });

    // Assign curve offset to each link
    linkGroups.forEach(group => {
      const count = group.length;
      group.forEach((link, i) => {
        (link as any).curveOffset = count === 1 ? 0 : (i - (count - 1) / 2) * 25;
      });
    });

    // Create container for zoom/pan FIRST
    const container = svg.append('g')
      .attr('class', 'graph-container');

    // Create zoom behavior - store in ref for button controls
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on('zoom', (event) => {
        container.attr('transform', event.transform);
      });

    zoomRef.current = zoom;

    // Apply zoom to SVG - enable pan and zoom with mouse
    svg.call(zoom)
      .on('dblclick.zoom', null); // Disable double-click zoom

    // Set initial zoom
    const initialTransform = d3.zoomIdentity.translate(centerX, centerY).scale(0.9).translate(-centerX, -centerY);
    svg.call(zoom.transform, initialTransform);

    // Create gradient definitions
    const defs = svg.append('defs');

    // Gradient for links
    const gradient = defs.append('linearGradient')
      .attr('id', 'linkGradient')
      .attr('gradientUnits', 'userSpaceOnUse');

    gradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', '#8b5cf6');

    gradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', '#06b6d4');

    // Glow filter for current user
    const filter = defs.append('filter')
      .attr('id', 'glow')
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%');

    filter.append('feGaussianBlur')
      .attr('stdDeviation', '3')
      .attr('result', 'coloredBlur');

    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Create force simulation with better spreading
    const simulation = d3.forceSimulation<SimulationNode>(nodes)
      .force('link', d3.forceLink<SimulationNode, SimulationLink>(links)
        .id(d => d.id)
        .distance(150)
        .strength(0.3))
      .force('charge', d3.forceManyBody().strength(-500))
      .force('center', d3.forceCenter(centerX, centerY))
      .force('collision', d3.forceCollide().radius(60))
      .force('x', d3.forceX(centerX).strength(0.05))
      .force('y', d3.forceY(centerY).strength(0.05));

    // Create arrow markers for different colors
    defs.append('marker')
      .attr('id', 'arrowhead-credit')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('markerWidth', 5)
      .attr('markerHeight', 5)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#22c55e');

    defs.append('marker')
      .attr('id', 'arrowhead-debit')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('markerWidth', 5)
      .attr('markerHeight', 5)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#ef4444');

    // Create curved path links for each transaction
    const link = container.append('g')
      .attr('class', 'links')
      .selectAll('path')
      .data(links)
      .join('path')
      .attr('fill', 'none')
      .attr('stroke', d => d.direction === 'CREDIT' ? '#22c55e' : '#ef4444')
      .attr('stroke-opacity', 0.7)
      .attr('stroke-width', d => Math.min(Math.max(d.amount / 500, 1.5), 4))
      .attr('marker-end', d => d.direction === 'CREDIT' ? 'url(#arrowhead-credit)' : 'url(#arrowhead-debit)')
      .style('cursor', 'pointer')
      .on('mouseover', function (_event, d) {
        d3.select(this)
          .attr('stroke-opacity', 1)
          .attr('stroke-width', 4);

        // Show tooltip
        const tooltip = container.append('g')
          .attr('class', 'link-tooltip')
          .attr('transform', `translate(${((d.source as SimulationNode).x! + (d.target as SimulationNode).x!) / 2}, ${((d.source as SimulationNode).y! + (d.target as SimulationNode).y!) / 2 - 30})`);

        tooltip.append('rect')
          .attr('x', -60)
          .attr('y', -25)
          .attr('width', 120)
          .attr('height', 50)
          .attr('rx', 6)
          .attr('fill', colors.tooltipBg)
          .attr('stroke', colors.tooltipBorder);

        tooltip.append('text')
          .attr('text-anchor', 'middle')
          .attr('y', -8)
          .attr('fill', d.direction === 'CREDIT' ? '#22c55e' : '#ef4444')
          .attr('font-size', '12px')
          .attr('font-weight', '600')
          .text(`₹${d.amount.toLocaleString()}`);

        tooltip.append('text')
          .attr('text-anchor', 'middle')
          .attr('y', 10)
          .attr('fill', colors.tooltipText)
          .attr('font-size', '9px')
          .text(d.direction === 'CREDIT' ? 'Received' : 'Sent');
      })
      .on('mouseout', function (_event, d) {
        d3.select(this)
          .attr('stroke-opacity', 0.7)
          .attr('stroke-width', Math.min(Math.max(d.amount / 500, 1.5), 4));

        container.selectAll('.link-tooltip').remove();
      });

    // Create node groups
    const node = container.append('g')
      .attr('class', 'nodes')
      .selectAll<SVGGElement, SimulationNode>('g')
      .data(nodes)
      .join('g');

    // Apply drag behavior
    node.call(d3.drag<SVGGElement, SimulationNode>()
      .on('start', dragstarted)
      .on('drag', dragged)
      .on('end', dragended));

    // Node circles with scroll-to-resize
    node.append('circle')
      .attr('r', d => d.radius)
      .attr('fill', d => d.isCurrentUser ? '#8b5cf6' : colors.nodeFill)
      .attr('stroke', d => d.isCurrentUser ? '#a78bfa' : colors.nodeStroke)
      .attr('stroke-width', 2)
      .attr('filter', d => d.isCurrentUser ? 'url(#glow)' : null)
      .style('cursor', 'ns-resize')
      .on('click', (event, d) => {
        event.stopPropagation();
        setSelectedNode(d);
      })
      .on('mouseover', function (_event, d) {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('r', d.radius + 5)
          .attr('stroke', '#8b5cf6');
      })
      .on('mouseout', function (_event, d) {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('r', d.radius)
          .attr('stroke', d.isCurrentUser ? '#a78bfa' : colors.nodeStroke);
      })
      .on('wheel', function (event, d) {
        event.preventDefault();
        event.stopPropagation();

        // Calculate new radius based on scroll direction
        const delta = event.deltaY > 0 ? -2 : 2;
        const minRadius = 12;
        const maxRadius = 60;
        d.radius = Math.max(minRadius, Math.min(maxRadius, d.radius + delta));

        // Update circle radius
        d3.select(this)
          .attr('r', d.radius);

        // Update label positions relative to new radius
        const parent = d3.select(this.parentNode as SVGGElement);
        parent.select('.node-label').attr('dy', d.radius + 15);
        parent.select('.node-vpa').attr('dy', -(d.radius + 10));

        // Update collision force with new radius
        simulation.force('collision', d3.forceCollide<SimulationNode>().radius(n => n.radius + 15));
        simulation.alpha(0.1).restart();
      });

    // Node labels (positioned relative to radius)
    node.append('text')
      .attr('class', 'node-label')
      .attr('dy', d => d.radius + 15)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.nodeLabel)
      .attr('font-size', '11px')
      .attr('font-weight', d => d.isCurrentUser ? '600' : '400')
      .style('pointer-events', 'none')
      .text(d => {
        const name = d.name || d.vpa.split('@')[0];
        return name.length > 10 ? name.substring(0, 10) + '...' : name;
      });

    // Node VPA indicator (positioned relative to radius)
    node.append('text')
      .attr('class', 'node-vpa')
      .attr('dy', d => -(d.radius + 10))
      .attr('text-anchor', 'middle')
      .attr('fill', colors.nodeSecondaryLabel)
      .attr('font-size', '9px')
      .style('pointer-events', 'none')
      .text(d => d.isCurrentUser ? '(You)' : '');

    // Update positions on simulation tick
    simulation.on('tick', () => {
      // Update curved path links
      link.attr('d', (d: any) => {
        const source = d.source as SimulationNode;
        const target = d.target as SimulationNode;
        const dx = target.x! - source.x!;
        const dy = target.y! - source.y!;

        // Calculate curve control point offset
        const curveOffset = d.curveOffset || 0;

        if (curveOffset === 0) {
          // Straight line for single links
          return `M${source.x},${source.y}L${target.x},${target.y}`;
        }

        // Curved path for multiple links
        const midX = (source.x! + target.x!) / 2;
        const midY = (source.y! + target.y!) / 2;

        // Perpendicular offset
        const angle = Math.atan2(dy, dx);
        const offsetX = midX + curveOffset * Math.cos(angle + Math.PI / 2);
        const offsetY = midY + curveOffset * Math.sin(angle + Math.PI / 2);

        return `M${source.x},${source.y}Q${offsetX},${offsetY} ${target.x},${target.y}`;
      });

      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    // Drag functions
    function dragstarted(event: d3.D3DragEvent<SVGGElement, SimulationNode, SimulationNode>, d: SimulationNode) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: d3.D3DragEvent<SVGGElement, SimulationNode, SimulationNode>, d: SimulationNode) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: d3.D3DragEvent<SVGGElement, SimulationNode, SimulationNode>, d: SimulationNode) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    // Click outside to deselect
    svg.on('click', () => setSelectedNode(null));

    // Cleanup
    return () => {
      simulation.stop();
    };
  }, [data, dimensions, currentUserVpa, isDark]);

  // Format amount helper
  const formatAmount = (amount: number): string => {
    if (amount >= 100000) return (amount / 100000).toFixed(1) + 'L';
    if (amount >= 1000) return (amount / 1000).toFixed(1) + 'K';
    return amount.toString();
  };

  // Zoom controls
  const handleZoom = (factor: number) => {
    if (!svgRef.current || !zoomRef.current) return;
    const svg = d3.select(svgRef.current);
    const currentTransform = d3.zoomTransform(svgRef.current);
    const newScale = currentTransform.k * factor;

    svg.transition()
      .duration(300)
      .call(
        zoomRef.current.scaleTo,
        newScale
      );
  };

  const handleReset = () => {
    if (!svgRef.current || !zoomRef.current) return;
    const svg = d3.select(svgRef.current);
    const { width, height } = dimensions;
    const centerX = width / 2;
    const centerY = height / 2;

    svg.transition()
      .duration(500)
      .call(
        zoomRef.current.transform,
        d3.zoomIdentity.translate(centerX, centerY).scale(0.9).translate(-centerX, -centerY)
      );
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-125 bg-slate-100 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800/50">
        <RefreshCw className="w-8 h-8 text-primary-500 animate-spin mb-4" />
        <p className="text-slate-600 dark:text-slate-400">Loading transaction network...</p>
      </div>
    );
  }

  if (!data.nodes.length) {
    return (
      <div className="flex flex-col items-center justify-center h-125 bg-slate-100 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800/50">
        <div className="w-16 h-16 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center mb-4">
          <Maximize2 className="w-8 h-8 text-slate-400 dark:text-slate-600" />
        </div>
        <p className="text-slate-600 dark:text-slate-400 text-center">No transaction network data available</p>
        <p className="text-slate-500 dark:text-slate-500 text-sm text-center mt-2">
          Start transacting to build your network
        </p>
      </div>
    );
  }

  return (
    <div className={isFullscreen ? 'fixed inset-0 z-50 bg-white dark:bg-slate-950' : 'relative'}>
      {/* Fullscreen Header */}
      {isFullscreen && (
        <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-linear-to-b from-white dark:from-slate-950 to-transparent">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Transaction Network</h2>
          <button
            onClick={() => setIsFullscreen(false)}
            className="w-10 h-10 rounded-lg bg-slate-200/80 dark:bg-slate-800/80 backdrop-blur-sm border border-slate-300/50 dark:border-slate-700/50 flex items-center justify-center text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-300/80 dark:hover:bg-slate-700/80 transition-colors"
            title="Exit Fullscreen"
          >
            <X size={20} />
          </button>
        </div>
      )}

      {/* Graph Container */}
      <div
        ref={containerRef}
        className={`bg-slate-100 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800/50 overflow-hidden ${isFullscreen ? 'h-full rounded-none border-0' : 'h-125'
          }`}
      >
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          className="bg-linear-to-br from-slate-50 via-slate-100 to-slate-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 cursor-grab active:cursor-grabbing touch-none"
        />

        {/* Controls */}
        <div className={`absolute ${isFullscreen ? 'top-16' : 'top-4'} right-4 flex flex-col gap-2`}>
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="w-10 h-10 rounded-lg bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-slate-200/50 dark:border-slate-700/50 flex items-center justify-center text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-700/80 transition-colors"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
          <button
            onClick={() => handleZoom(1.2)}
            className="w-10 h-10 rounded-lg bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-slate-200/50 dark:border-slate-700/50 flex items-center justify-center text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-700/80 transition-colors"
            title="Zoom In"
          >
            <ZoomIn size={18} />
          </button>
          <button
            onClick={() => handleZoom(0.8)}
            className="w-10 h-10 rounded-lg bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-slate-200/50 dark:border-slate-700/50 flex items-center justify-center text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-700/80 transition-colors"
            title="Zoom Out"
          >
            <ZoomOut size={18} />
          </button>
          <button
            onClick={handleReset}
            className="w-10 h-10 rounded-lg bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-slate-200/50 dark:border-slate-700/50 flex items-center justify-center text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-700/80 transition-colors"
            title="Reset View"
          >
            <RotateCcw size={18} />
          </button>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="w-10 h-10 rounded-lg bg-primary-500/20 backdrop-blur-sm border border-primary-500/30 flex items-center justify-center text-primary-400 hover:text-white hover:bg-primary-500/30 transition-colors"
              title="Refresh"
            >
              <RefreshCw size={18} />
            </button>
          )}
        </div>

        {/* Legend */}
        <div className="absolute bottom-4 left-4 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-lg p-3 border border-slate-200/50 dark:border-slate-700/50">
          <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mb-2">Legend</p>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-primary-500 ring-2 ring-primary-400/50" />
              <span className="text-xs text-slate-700 dark:text-slate-300">You</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-slate-400 dark:bg-slate-700 ring-2 ring-slate-300/50 dark:ring-slate-600/50" />
              <span className="text-xs text-slate-700 dark:text-slate-300">Contacts</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-0.5 bg-green-500 rounded-full" />
              <span className="text-xs text-slate-700 dark:text-slate-300">Received (Credit)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-0.5 bg-red-500 rounded-full" />
              <span className="text-xs text-slate-700 dark:text-slate-300">Sent (Debit)</span>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {data.links.length} transactions
          </p>
        </div>
      </div>

      {/* Selected Node Details */}
      {selectedNode && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="absolute top-4 left-4 bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm rounded-xl p-4 border border-slate-200/50 dark:border-slate-700/50 max-w-xs"
        >
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${selectedNode.isCurrentUser ? 'bg-primary-500' : 'bg-slate-300 dark:bg-slate-700'
              }`}>
              <span className="text-white font-semibold">
                {(selectedNode.name || selectedNode.vpa)[0].toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-slate-900 dark:text-white font-medium truncate">
                {selectedNode.name || selectedNode.vpa.split('@')[0]}
              </h4>
              <p className="text-slate-600 dark:text-slate-400 text-sm truncate">{selectedNode.vpa}</p>
              {selectedNode.transactionCount && (
                <p className="text-slate-500 text-xs mt-1">
                  {selectedNode.transactionCount} transactions
                </p>
              )}
            </div>
          </div>
          {(selectedNode.totalSent || selectedNode.totalReceived) && (
            <div className="mt-3 pt-3 border-t border-slate-200/50 dark:border-slate-700/50 grid grid-cols-2 gap-2">
              {selectedNode.totalSent !== undefined && (
                <div>
                  <p className="text-xs text-slate-500">Total Sent</p>
                  <p className="text-sm font-medium text-danger-400">
                    ₹{formatAmount(selectedNode.totalSent)}
                  </p>
                </div>
              )}
              {selectedNode.totalReceived !== undefined && (
                <div>
                  <p className="text-xs text-slate-500">Total Received</p>
                  <p className="text-sm font-medium text-success-400">
                    ₹{formatAmount(selectedNode.totalReceived)}
                  </p>
                </div>
              )}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
};

export default NetworkGraph;
