// app.js

document.addEventListener('DOMContentLoaded', function () {
  // --- DOM Elements ---
  const graphContainer = document.getElementById('graph-container');
  const searchInput = document.getElementById('searchInput');
  const categoryFilter = document.getElementById('categoryFilter');
  const exportJsonButton = document.getElementById('exportJsonButton');
  const graphLoader = document.querySelector('.graph-loader');

  // Mobile elements
  const mobileControls = document.querySelector('.mobile-controls');
  const graphNavBtn = document.getElementById('graphNavBtn');
  const viewInfoBtn = document.getElementById('viewInfoBtn');
  const viewCatalogBtn = document.getElementById('viewCatalogBtn');
  const searchBtn = document.getElementById('searchBtn');
  const networkControlsOverlay = document.querySelector('.network-controls-overlay');
  const zoomInBtn = document.getElementById('zoomInBtn');
  const zoomOutBtn = document.getElementById('zoomOutBtn');
  const fitBtn = document.getElementById('fitBtn');

  // Info Panel Elements
  const nodeIdDisplay = document.getElementById('node-id-display');
  const nodeNameDisplay = document.getElementById('node-name-display');
  const nodeCategoryDisplay = document.getElementById('node-category-display');
  const nodeDescriptionDisplay = document.getElementById('node-description-display');
  const nodeConnectionsList = document.getElementById('node-connections-list');
  const nodeSegmentsList = document.getElementById('node-segments-list');

  // Section references
  const infoSection = document.getElementById('info-section');
  const tablesSection = document.getElementById('tables-section');
  const graphSection = document.getElementById('graph-section');

  // Table Body Elements
  const conceptsTableBody = document.querySelector('#concepts-table tbody');
  const practicesTableBody = document.querySelector('#practices-table tbody');
  const analogiesTableBody = document.querySelector('#analogies-table tbody');
  const segmentsTableBody = document.querySelector('#segments-table tbody');

  // --- Global Variables ---
  let allNodes = []; // To store the original full list of nodes for filtering
  let allEdges = []; // To store the original full list of edges
  let network = null; // Vis.js network instance
  let nodesDataSet = new vis.DataSet(); // Vis.js DataSet for nodes
  let edgesDataSet = new vis.DataSet(); // Vis.js DataSet for edges
  let isMobileDevice = window.innerWidth <= 768; // Check if we're on a mobile device
  let touchStarted = null; // For tracking touch interactions
  let containmentInterval = null; // For periodic containment checks
  let isStabilized = false; // Track if the network is stabilized
  let lastContainmentCheck = 0; // Throttle containment checks

  // --- Color Settings ---
  const colors = {
    concept: { background: '#4f3a96', border: '#6f5cac', highlight: { background: '#6f5cac', border: '#8c7cc2' }, hover: { background: '#6f5cac', border: '#8c7cc2' } },
    practice: { background: '#118377', border: '#19a596', highlight: { background: '#19a596', border: '#25c3b4' }, hover: { background: '#19a596', border: '#25c3b4' } },
    analogy: { background: '#9b6b36', border: '#bf8240', highlight: { background: '#bf8240', border: '#d79a5a' }, hover: { background: '#bf8240', border: '#d79a5a' } },
    segment: { background: '#672d52', border: '#8a3a6d', highlight: { background: '#8a3a6d', border: '#a94c85' }, hover: { background: '#8a3a6d', border: '#a94c85' } }
  };

  // --- Fetch and Initialize ---
  fetch('graph-data.json')
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status} - Did you create graph-data.json?`);
      }
      return response.json();
    })
    .then(data => {
      // Store original data for filtering and other operations
      allNodes = data.nodes.map(node => ({
        id: node.id,
        label: node.name.length > 20 ? node.name.substring(0, 18) + '...' : node.name, // More aggressive truncation
        title: node.name, // Full name on hover
        group: node.category, // For Vis.js group styling
        category: node.category,
        description: node.description || node.summary || '',
        timestamp_start: node.timestamp_start, // For segments
        timestamp_end: node.timestamp_end,     // For segments
        font: { face: "'Cormorant Garamond', Georgia, serif" }
      }));

      // Create edges with proper formatting to avoid escaping the container
      allEdges = data.edges.map(edge => ({
        from: edge.source,
        to: edge.target,
        label: edge.label && edge.label.length > 15 ? edge.label.substring(0, 12) + '...' : edge.label, // Trim long edge labels
        arrows: {
          to: { enabled: true, scaleFactor: 0.7, type: 'arrow' }
        },
        font: {
          align: 'middle',
          size: 11,
          face: "'Amiri', serif",
          color: '#e5e1d8',
          multi: false, // No multi-line labels (prevents overflow)
          strokeWidth: 0
        },
        color: {
          color: 'rgba(229, 225, 216, 0.4)',
          highlight: '#c9a227',
          hover: 'rgba(229, 225, 216, 0.7)'
        },
        width: 1.5,
        smooth: {
          type: 'cubicBezier',
          forceDirection: 'horizontal',
          roundness: 0.4
        },
        // Add shorter when displaying on mobile
        length: isMobileDevice ? 120 : 180 // Shortened edge length for better containment
      }));

      // Initialize DataSet for Vis.js (these will be filtered later)
      nodesDataSet.add(allNodes);
      edgesDataSet.add(allEdges);

      initializeGraph();
      populateTables();
      initializeMobileControls();

      // Hide loader after graph is initialized
      setTimeout(() => {
        graphLoader.classList.add('animate__animated', 'animate__fadeOut');
        graphLoader.addEventListener('animationend', () => {
          graphLoader.style.display = 'none';
        });
      }, 1200);
    })
    .catch(error => {
      console.error('Error loading graph data:', error);
      graphContainer.innerHTML = `<p style="color:#c9a227; text-align:center; font-family:'Amiri',serif; font-style:italic;">Error loading graph data. Make sure 'graph-data.json' exists and is valid. Details: ${error.message}</p>`;
      graphLoader.style.display = 'none';
    });

  // --- Graph Initialization ---
  function initializeGraph() {
    const data = {
      nodes: nodesDataSet,
      edges: edgesDataSet
    };

    // Clear any existing containment interval
    if (containmentInterval) {
      clearInterval(containmentInterval);
    }

    // Calculate container dimensions
    const containerRect = graphContainer.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;

    // Create more constrained graph layout for better containment
    const options = {
      layout: {
        improvedLayout: true,
        randomSeed: 42, // Consistent layout
        clusterThreshold: 150,
      },
      edges: {
        smooth: {
          type: 'cubicBezier',
          forceDirection: 'horizontal',
          roundness: 0.4
        },
        arrows: { to: { enabled: true, scaleFactor: 0.7 } },
        font: {
          size: 11,
          face: "'Amiri', serif",
          color: '#e5e1d8',
          strokeWidth: 0,
          background: 'rgba(26, 16, 37, 0.6)',
          multi: false
        },
        width: 1.5,
        selectionWidth: 2.5,
        hoverWidth: 2
      },
      nodes: {
        shape: 'ellipse',
        size: isMobileDevice ? 30 : 25, // Larger on mobile for touch targets
        font: {
          size: isMobileDevice ? 16 : 14,
          face: "'Cormorant Garamond', Georgia, serif",
          color: '#f5f1e3',
          strokeWidth: 0,
          strokeColor: 'rgba(0,0,0,0.5)'
        },
        borderWidth: 2,
        borderWidthSelected: 3,
        shadow: {
          enabled: true,
          color: 'rgba(0,0,0,0.3)',
          size: 7,
          x: 3,
          y: 3
        },
        scaling: {
          min: isMobileDevice ? 20 : 15,  // Minimum node size
          max: isMobileDevice ? 40 : 35   // Maximum node size
        }
      },
      groups: {
        concept: {
          color: colors.concept,
          shape: 'hexagon',
          font: { size: isMobileDevice ? 16 : 14, color: '#f5f1e3' },
          size: isMobileDevice ? 30 : 25,
          mass: 2.5
        },
        practice: {
          color: colors.practice,
          shape: 'diamond',
          font: { size: isMobileDevice ? 16 : 14, color: '#f5f1e3' },
          size: isMobileDevice ? 30 : 25,
          mass: 2
        },
        analogy: {
          color: colors.analogy,
          shape: 'star',
          font: { size: isMobileDevice ? 16 : 14, color: '#f5f1e3' },
          size: isMobileDevice ? 27 : 22,
          mass: 1.5
        },
        segment: {
          color: colors.segment,
          shape: 'dot',
          font: { size: isMobileDevice ? 15 : 13, color: '#f5f1e3' },
          size: isMobileDevice ? 20 : 15,
          mass: 1
        }
      },
      interaction: {
        hover: true,
        hoverConnectedEdges: true,
        tooltipDelay: isMobileDevice ? 1000 : 200,
        navigationButtons: true,
        keyboard: !isMobileDevice,
        multiselect: !isMobileDevice,
        selectable: true,
        zoomView: true,
        dragView: true,
        hideEdgesOnDrag: isMobileDevice,
        hideEdgesOnZoom: isMobileDevice,
        // Limit interactivity on mobile to prevent overflow
        dragNodes: !isMobileDevice || containerWidth > 400,
        multiselect: !isMobileDevice
      },
      physics: {
        enabled: true,
        solver: 'forceAtlas2Based',
        forceAtlas2Based: {
          gravitationalConstant: -60, // Less negative for tighter clustering
          centralGravity: 0.025, // Increased to keep nodes centered
          springLength: isMobileDevice ? 80 : 100, // Shorter spring length
          springConstant: 0.12, // Stronger springs
          damping: 0.4,
          avoidOverlap: 1.0 // Maximum overlap avoidance
        },
        stabilization: {
          enabled: true,
          iterations: 1500, // More iterations for better stabilization
          updateInterval: 25,
          fit: true,
          onlyDynamicEdges: false,
          adaptiveTimestep: true
        },
      },
      // CRITICAL: Keep nodes inside container boundaries
      bounds: {
        enabled: true,
        min: {
          x: -containerWidth / 2 + 50,
          y: -containerHeight / 2 + 50
        },
        max: {
          x: containerWidth / 2 - 50,
          y: containerHeight / 2 - 50
        },
        useAvailableNodes: true // Enable to calculate bounds from all nodes
      },
      configure: {
        enabled: false,
      },
      clustering: {
        enabled: false
      }
    };

    // Create the network with more aggressive options
    if (network) {
      network.destroy(); // Clean up any existing network instance
    }

    network = new vis.Network(graphContainer, data, options);

    // Force immediate containment
    setTimeout(enforceContainment, 100);

    // Setup event listeners
    network.on('click', function (params) {
      clearInfoPanel();
      if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        const selectedNode = allNodes.find(n => n.id === nodeId);
        if (selectedNode) {
          displayNodeInfo(selectedNode);

          if (isMobileDevice) {
            infoSection.scrollIntoView({ behavior: 'smooth' });
          }
        }
      }
    });

    // Glowing effect on hover
    network.on('hoverNode', function (params) {
      const nodeId = params.node;
      const node = nodesDataSet.get(nodeId);
      const category = node.category || node.group;
      const glowColor = colors[category].hover.border;

      nodesDataSet.update({
        id: nodeId,
        shadow: {
          enabled: true,
          color: glowColor,
          size: 15,
          x: 0,
          y: 0
        }
      });
    });

    // Remove glow on blur
    network.on('blurNode', function (params) {
      const nodeId = params.node;
      nodesDataSet.update({
        id: nodeId,
        shadow: {
          enabled: true,
          color: 'rgba(0,0,0,0.3)',
          size: 7,
          x: 3,
          y: 3
        }
      });
    });

    // Listen for resize to keep nodes inside container
    window.addEventListener('resize', function () {
      // Update isMobileDevice
      isMobileDevice = window.innerWidth <= 768;

      // Delay to allow DOM to settle
      setTimeout(() => {
        enforceContainment();

        // Update bounds based on new container size
        const newRect = graphContainer.getBoundingClientRect();
        network.setOptions({
          bounds: {
            min: {
              x: -newRect.width / 2 + 50,
              y: -newRect.height / 2 + 50
            },
            max: {
              x: newRect.width / 2 - 50,
              y: newRect.height / 2 - 50
            }
          }
        });
      }, 100);
    });

    // KEY FIX: After zoom/drag operations, force containment
    network.on('dragEnd', enforceContainment);
    network.on('zoom', throttledContainment);
    network.on('dragStart', () => {
      if (isStabilized) {
        // Temporarily disable physics while dragging for better performance
        network.setOptions({ physics: { enabled: false } });
      }
    });
    network.on('dragEnd', () => {
      // Re-enable physics after drag if needed
      setTimeout(() => {
        if (isStabilized) {
          enforceContainment();
        }
      }, 50);
    });

    // After stabilization, apply more containment checks
    network.on("stabilizationIterationsDone", function () {
      isStabilized = true;

      // First fit to ensure all nodes are visible
      network.fit({ animation: { duration: 800, easingFunction: 'easeInOutQuad' } });

      // Apply multiple checks with timing
      setTimeout(enforceContainment, 200);
      setTimeout(() => {
        // Disable physics after stabilization for better performance
        network.setOptions({ physics: { enabled: false } });
        enforceContainment();

        // Set up periodic containment checks
        containmentInterval = setInterval(enforceContainment, 3000);
      }, 1000);
    });

    // Mobile touch handling
    if (isMobileDevice) {
      setupMobileTouchHandlers();
    }

    // Add canvas animation effects
    addCanvasEffects();

    // Force a final fit
    setTimeout(() => {
      network.fit({ animation: { duration: 500, easingFunction: 'easeOutQuad' } });
    }, 1500);
  }

  // Throttle containment checks to improve performance
  function throttledContainment() {
    const now = Date.now();
    if (now - lastContainmentCheck > 200) { // Only run every 200ms
      lastContainmentCheck = now;
      enforceContainment();
    }
  }

  // Enhanced comprehensive function to enforce containment
  function enforceContainment() {
    if (!network) return;

    // First ensure canvas dimensions match container
    const container = graphContainer.getBoundingClientRect();
    const canvas = network.canvas.frame.canvas;

    // Update canvas dimensions if they've changed
    if (canvas.width !== container.width || canvas.height !== container.height) {
      canvas.width = container.width;
      canvas.height = container.height;
      canvas.style.width = `${container.width}px`;
      canvas.style.height = `${container.height}px`;
    }

    // Get current positions
    const positions = network.getPositions();
    const nodeIds = Object.keys(positions);

    if (nodeIds.length === 0) return;

    // Check if any nodes are outside or close to the edge
    const padding = Math.max(30, container.width * 0.05); // Dynamic padding based on container size
    let needsAdjustment = false;
    let hasOutOfBoundsNodes = false;

    const viewPosition = network.getViewPosition();
    const scale = network.getScale();

    // Calculate visible area in canvas coordinates
    const visibleArea = {
      left: viewPosition.x - (container.width / 2) / scale,
      top: viewPosition.y - (container.height / 2) / scale,
      right: viewPosition.x + (container.width / 2) / scale,
      bottom: viewPosition.y + (container.height / 2) / scale
    };

    // Add safety margin
    const safetyMargin = 50 / scale;
    visibleArea.left += safetyMargin;
    visibleArea.top += safetyMargin;
    visibleArea.right -= safetyMargin;
    visibleArea.bottom -= safetyMargin;

    // Check nodes against visible area
    for (const nodeId of nodeIds) {
      const pos = positions[nodeId];

      // Check if node is outside visible area
      if (pos.x < visibleArea.left || pos.y < visibleArea.top ||
        pos.x > visibleArea.right || pos.y > visibleArea.bottom) {
        hasOutOfBoundsNodes = true;
        break;
      }

      // Check DOM position for nodes near edges
      const domPos = network.canvasToDOM(pos);
      if (domPos.x < padding || domPos.y < padding ||
        domPos.x > container.width - padding || domPos.y > container.height - padding) {
        needsAdjustment = true;
      }
    }

    // If any node is out of bounds, fit the view with animation
    if (hasOutOfBoundsNodes) {
      network.fit({
        animation: {
          duration: 500,
          easingFunction: 'easeOutQuad'
        },
        scale: scale * 0.9 // Scale slightly to ensure all nodes are visible
      });
    }
    // If nodes are near edges but not out of bounds, make minor adjustments
    else if (needsAdjustment && isStabilized) {
      // Calculate the current scale
      const currentScale = network.getScale();

      // Slightly scale down and center
      network.moveTo({
        scale: currentScale * 0.95,
        animation: {
          duration: 300,
          easingFunction: 'easeOutQuad'
        }
      });
    }

    // Force redraw after adjustment
    network.redraw();
  }

  // Setup mobile touch handlers
  function setupMobileTouchHandlers() {
    let lastTap = 0;
    let initialPinchDistance = 0;
    let initialScale = 0;
    let preventScrollOnTouch = false;

    graphContainer.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2) {
        // Pinch zoom gesture detected
        initialPinchDistance = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        initialScale = network.getScale();
        preventScrollOnTouch = true;
        e.preventDefault();
      } else if (e.touches.length === 1) {
        // Single touch - could be drag or tap
        touchStarted = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
          time: new Date().getTime()
        };
      }
    }, { passive: false });

    graphContainer.addEventListener('touchmove', function (e) {
      if (preventScrollOnTouch) {
        e.preventDefault();
      }

      if (e.touches.length === 2) {
        // Handle pinch zoom
        const currentDistance = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );

        // Calculate new scale
        if (initialPinchDistance > 0) {
          const scaleFactor = currentDistance / initialPinchDistance;
          const newScale = initialScale * scaleFactor;

          // Update scale but maintain position
          network.moveTo({
            scale: newScale,
            animation: false
          });

          // Check containment after zoom
          throttledContainment();
        }

        e.preventDefault();
      }
    }, { passive: false });

    graphContainer.addEventListener('touchend', function (e) {
      const currentTime = new Date().getTime();
      preventScrollOnTouch = false;

      if (touchStarted && e.changedTouches.length === 1) {
        const touchEnded = {
          x: e.changedTouches[0].clientX,
          y: e.changedTouches[0].clientY,
          time: currentTime
        };

        // Check if it's a quick tap (under 300ms)
        const touchDuration = touchEnded.time - touchStarted.time;
        if (touchDuration < 300) {
          // Check if it's a double tap
          const tapLength = touchEnded.time - lastTap;
          if (tapLength < 300 && tapLength > 0) {
            // Double tap detected - zoom in at that position
            const position = network.DOMtoCanvas({
              x: e.changedTouches[0].clientX,
              y: e.changedTouches[0].clientY
            });

            network.moveTo({
              position: position,
              scale: network.getScale() * 1.5,
              animation: { duration: 500, easingFunction: 'easeInOutQuad' }
            });

            // Check containment after zoom
            setTimeout(enforceContainment, 600);
            e.preventDefault();
          }

          lastTap = currentTime;
        } else {
          // Was a drag, check containment
          enforceContainment();
        }
      }

      // Reset touch tracking
      touchStarted = null;
      initialPinchDistance = 0;
    }, { passive: false });

    // Override default page scroll when interacting with graph
    graphContainer.addEventListener('wheel', function (e) {
      if (e.target.closest('#graph-container')) {
        // Prevent scroll and allow network zoom
        e.preventDefault();

        // After zoom, check containment
        setTimeout(throttledContainment, 50);
      }
    }, { passive: false });
  }

  // Initialize mobile navigation controls
  function initializeMobileControls() {
    if (!isMobileDevice) return;

    // Graph navigation buttons
    zoomInBtn.addEventListener('click', function () {
      const scale = network.getScale() * 1.2;
      network.moveTo({ scale: scale, animation: true });
    });

    zoomOutBtn.addEventListener('click', function () {
      const scale = network.getScale() * 0.8;
      network.moveTo({ scale: scale, animation: true });
    });

    fitBtn.addEventListener('click', function () {
      network.fit({ animation: { duration: 800, easingFunction: 'easeInOutQuad' } });
    });

    // Bottom navigation buttons
    graphNavBtn.addEventListener('click', function () {
      networkControlsOverlay.style.display = networkControlsOverlay.style.display === 'flex' ? 'none' : 'flex';
      graphSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    viewInfoBtn.addEventListener('click', function () {
      infoSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    viewCatalogBtn.addEventListener('click', function () {
      tablesSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    searchBtn.addEventListener('click', function () {
      // Focus on search input and scroll to controls
      searchInput.focus();
      const controls = document.querySelector('.controls');
      controls.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // Detect orientation changes to adjust layout
    window.addEventListener('orientationchange', function () {
      setTimeout(() => {
        if (network) {
          network.fit({ animation: true });
        }
      }, 300);
    });

    // Hide navigation overlay when clicking outside
    document.addEventListener('click', function (event) {
      if (networkControlsOverlay.style.display === 'flex' &&
        !networkControlsOverlay.contains(event.target) &&
        event.target !== graphNavBtn) {
        networkControlsOverlay.style.display = 'none';
      }
    });
  }

  // Add subtle particle effects to the graph background
  function addCanvasEffects() {
    if (!network) return;

    // Get the canvas and its context for adding visual effects
    const canvas = network.canvas.frame.canvas;
    const ctx = canvas.getContext('2d');

    // Create an array of particles (more on mobile for visual impact)
    const particleCount = isMobileDevice ? 15 : 25;
    const particles = [];

    // Configure particles
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        radius: Math.random() * 2 + 1,
        speedX: Math.random() * 0.5 - 0.25,
        speedY: Math.random() * 0.5 - 0.25,
        color: 'rgba(201, 162, 39, ' + (Math.random() * 0.4 + 0.1) + ')',
        pulse: 0,
        pulseSpeed: Math.random() * 0.02 + 0.01
      });
    }

    // Animation frame for particles
    let animationFrame;

    // Function to draw and update particles
    function drawParticles() {
      // Clear previous frame - but don't clear the whole canvas to avoid flickering
      // The network will handle its own rendering

      // Update and draw particles
      particles.forEach(p => {
        // Update position
        p.x += p.speedX;
        p.y += p.speedY;

        // Make particles pulse
        p.pulse += p.pulseSpeed;
        const pulseFactor = Math.sin(p.pulse) * 0.5 + 0.5;
        const adjustedRadius = p.radius * (1 + pulseFactor * 0.3);

        // Wrap around edges with padding to ensure containment
        const padding = 50;
        if (p.x < -padding) p.x = canvas.width + padding;
        if (p.y < -padding) p.y = canvas.height + padding;
        if (p.x > canvas.width + padding) p.x = -padding;
        if (p.y > canvas.height + padding) p.y = -padding;

        // Only draw particles that are in the visible area with padding
        if (p.x > -padding && p.x < canvas.width + padding &&
          p.y > -padding && p.y < canvas.height + padding) {

          // Create gradient for particle
          const gradient = ctx.createRadialGradient(
            p.x, p.y, 0,
            p.x, p.y, adjustedRadius * 2.5
          );
          gradient.addColorStop(0, p.color.replace(')', ', ' + (0.8 * pulseFactor) + ')'));
          gradient.addColorStop(1, p.color.replace(')', ', 0)'));

          // Draw particle with gradient
          ctx.beginPath();
          ctx.arc(p.x, p.y, adjustedRadius * 2.5, 0, Math.PI * 2);
          ctx.fillStyle = gradient;
          ctx.fill();
        }
      });

      // Request next frame
      animationFrame = requestAnimationFrame(drawParticles);
    }

    // Start animation
    drawParticles();

    // Setup listener to cancel animation when component is unmounted or reinitialized
    window.addEventListener('beforeunload', () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    });

    // Also cancel when network is destroyed
    network.on('destroy', () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    });

    // Redraw particles when canvas size changes
    const resizeObserver = new ResizeObserver(() => {
      // Update particles to new canvas dimensions
      particles.forEach(p => {
        // Keep particles within new bounds
        if (p.x > canvas.width) p.x = Math.random() * canvas.width;
        if (p.y > canvas.height) p.y = Math.random() * canvas.height;
      });
    });

    // Observe the canvas for size changes
    resizeObserver.observe(canvas);
  }

  // --- Display Node Information ---
  function displayNodeInfo(node) {
    // Animate info panel updates
    const infoPanel = document.getElementById('info-panel');
    infoPanel.classList.add('animate__animated', 'animate__fadeIn');
    infoPanel.addEventListener('animationend', () => {
      infoPanel.classList.remove('animate__animated', 'animate__fadeIn');
    });

    nodeIdDisplay.textContent = node.id;
    nodeNameDisplay.textContent = node.title; // Full name
    nodeCategoryDisplay.textContent = node.category.charAt(0).toUpperCase() + node.category.slice(1); // Capitalize

    // Add category-specific styling to the category display
    nodeCategoryDisplay.style.color = colors[node.category].border;
    nodeCategoryDisplay.style.fontWeight = 'bold';

    nodeDescriptionDisplay.textContent = node.description;

    // Display connections
    nodeConnectionsList.innerHTML = ''; // Clear previous
    const connectedEdges = allEdges.filter(edge => edge.from === node.id || edge.to === node.id);

    connectedEdges.forEach(edge => {
      const li = document.createElement('li');
      let connectedNodeId, connectedNodeName, directionLabel;

      if (edge.from === node.id) {
        connectedNodeId = edge.to;
        directionLabel = `<i class="fas fa-long-arrow-alt-right" style="color: ${colors[node.category].border};"></i> ${edge.label || 'connects to'}`;
      } else {
        connectedNodeId = edge.from;
        directionLabel = `<i class="fas fa-long-arrow-alt-left" style="color: ${colors[node.category].border};"></i> ${edge.label || 'connected from'}`;
      }

      const connectedNode = allNodes.find(n => n.id === connectedNodeId);
      connectedNodeName = connectedNode ? connectedNode.title : connectedNodeId;

      li.innerHTML = `${directionLabel} <span class="connected-node-name">${connectedNodeName}</span> <small>(${connectedNodeId})</small>`;
      li.dataset.nodeId = connectedNodeId; // Store ID for click handler

      li.classList.add('animate__animated', 'animate__fadeInRight');
      li.style.animationDelay = `${connectedEdges.indexOf(edge) * 0.05}s`;

      li.style.cursor = 'pointer';
      li.onclick = () => { // Allow clicking on connected nodes in the list
        const nodeToFocus = allNodes.find(n => n.id === connectedNodeId);
        if (nodeToFocus) {
          displayNodeInfo(nodeToFocus);
          network.focus(nodeToFocus.id, { scale: 1.2, animation: { duration: 800, easingFunction: 'easeInOutQuad' } });
        }
      };
      nodeConnectionsList.appendChild(li);
    });

    // Display segments tied to this concept/practice
    nodeSegmentsList.innerHTML = '';
    if (node.category === 'concept' || node.category === 'practice') {
      const tiedSegmentEdges = allEdges.filter(edge =>
        (edge.from === node.id && allNodes.find(n => n.id === edge.to)?.category === 'segment') ||
        (edge.to === node.id && allNodes.find(n => n.id === edge.from)?.category === 'segment')
      );

      tiedSegmentEdges.forEach(edge => {
        const segmentNodeId = (allNodes.find(n => n.id === edge.from)?.category === 'segment') ? edge.from : edge.to;
        const segmentNode = allNodes.find(n => n.id === segmentNodeId);
        if (segmentNode) {
          const li = document.createElement('li');
          li.textContent = `${segmentNode.title} (${segmentNode.id})`;
          li.classList.add('animate__animated', 'animate__fadeInRight');
          li.style.animationDelay = `${tiedSegmentEdges.indexOf(edge) * 0.05}s`;
          li.style.cursor = 'pointer';
          li.onclick = () => {
            displayNodeInfo(segmentNode);
            network.focus(segmentNode.id, { scale: 1.2, animation: { duration: 800, easingFunction: 'easeInOutQuad' } });
          };
          nodeSegmentsList.appendChild(li);
        }
      });
      if (tiedSegmentEdges.length === 0) {
        const li = document.createElement('li');
        li.innerHTML = '<em>No passages directly connected to this wisdom.</em>';
        li.style.fontStyle = 'italic';
        li.style.opacity = '0.7';
        nodeSegmentsList.appendChild(li);
      }
    } else {
      const li = document.createElement('li');
      li.innerHTML = '<em>Not applicable for this type of wisdom.</em>';
      li.style.fontStyle = 'italic';
      li.style.opacity = '0.7';
      nodeSegmentsList.appendChild(li);
    }

    // Focus on the selected node with a bit of animation
    network.focus(node.id, {
      scale: 1.2,
      animation: {
        duration: 800,
        easingFunction: 'easeInOutQuad'
      }
    });
  }

  function clearInfoPanel() {
    nodeIdDisplay.textContent = '-';
    nodeNameDisplay.textContent = '-';
    nodeCategoryDisplay.textContent = '-';
    nodeCategoryDisplay.style.color = ''; // Reset color
    nodeDescriptionDisplay.textContent = '-';
    nodeConnectionsList.innerHTML = '';
    nodeSegmentsList.innerHTML = '';
  }

  // --- Search and Filter Logic ---
  function applyFilters() {
    if (!network || !allNodes.length) return;

    const searchTerm = searchInput.value.toLowerCase();
    const selectedCategory = categoryFilter.value;

    const filteredNodeIds = allNodes
      .filter(node => {
        const nameMatch = node.title.toLowerCase().includes(searchTerm);
        const descriptionMatch = node.description.toLowerCase().includes(searchTerm);
        const categoryMatch = selectedCategory === 'all' || node.category === selectedCategory;
        return (nameMatch || descriptionMatch) && categoryMatch;
      })
      .map(node => node.id);

    // Update Vis.js DataSet to show only filtered nodes and relevant edges
    nodesDataSet.clear();
    nodesDataSet.add(allNodes.filter(node => filteredNodeIds.includes(node.id)));

    edgesDataSet.clear();
    edgesDataSet.add(allEdges.filter(edge =>
      filteredNodeIds.includes(edge.from) && filteredNodeIds.includes(edge.to)
    ));

    // Add minor animation when filtering
    network.fit({ animation: { duration: 600, easingFunction: 'easeInOutQuad' } });
  }

  searchInput.addEventListener('input', applyFilters);
  categoryFilter.addEventListener('change', applyFilters);

  // --- Populate HTML Tables ---
  function populateTables() {
    const tableBodies = {
      concept: conceptsTableBody,
      practice: practicesTableBody,
      analogy: analogiesTableBody,
      segment: segmentsTableBody
    };

    const cardContainers = {
      concept: document.getElementById('concepts-cards'),
      practice: document.getElementById('practices-cards'),
      analogy: document.getElementById('analogies-cards'),
      segment: document.getElementById('segments-cards')
    };

    // Clear existing rows
    for (const category in tableBodies) {
      if (tableBodies[category]) tableBodies[category].innerHTML = '';
      if (cardContainers[category]) cardContainers[category].innerHTML = '';
    }

    allNodes.forEach(node => {
      const tableBody = tableBodies[node.category];
      const cardContainer = cardContainers[node.category];

      if (tableBody) {
        // Create regular table row
        const row = tableBody.insertRow();
        row.insertCell().textContent = node.id;
        row.insertCell().textContent = node.title;

        if (node.category === 'segment') {
          row.insertCell().textContent = node.summary || node.description; // Use summary for segments
        } else {
          row.insertCell().textContent = node.description;
        }
        // For segments, you might want to add timestamp columns if present
        if (node.category === 'segment' && segmentsTableBody.rows[0].cells.length === 3) { // if only 3 columns, add more
          segmentsTableBody.rows[0].insertCell().textContent = "Timestamp Start";
          segmentsTableBody.rows[0].insertCell().textContent = "Timestamp End";
        }
        if (node.category === 'segment') {
          const tsStartCell = row.insertCell();
          tsStartCell.textContent = node.timestamp_start || '-';
          const tsEndCell = row.insertCell();
          tsEndCell.textContent = node.timestamp_end || '-';
        }

        // Add mystical hover effect to rows
        row.style.cursor = 'pointer';
        row.style.transition = 'all 0.3s ease';
        row.classList.add('table-row-' + node.category);

        row.addEventListener('mouseenter', () => {
          row.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
          row.style.borderLeft = `3px solid ${colors[node.category].border}`;
        });

        row.addEventListener('mouseleave', () => {
          row.style.backgroundColor = '';
          row.style.borderLeft = '';
        });

        row.onclick = () => { // Click table row to focus on graph and show info
          displayNodeInfo(node);
          if (network && nodesDataSet.get(node.id)) { // Check if node is currently in the filtered graph
            network.focus(node.id, { scale: 1.5, animation: { duration: 800, easingFunction: 'easeInOutQuad' } });

            // On mobile, scroll to graph section after clicking a table row
            if (isMobileDevice) {
              setTimeout(() => {
                graphContainer.scrollIntoView({ behavior: 'smooth' });
              }, 300);
            }
          } else {
            // If node is filtered out, add back this node temporarily
            alert("This node isn't currently visible in the graph based on your filters. Please adjust your filters to view it in the network.");
          }
        };

        // Create card view for mobile
        if (cardContainer) {
          const card = document.createElement('div');
          card.className = 'data-card';
          card.dataset.nodeId = node.id;
          card.style.borderLeftColor = colors[node.category].border;

          const headerDiv = document.createElement('div');
          headerDiv.className = 'data-card-header';

          const idSpan = document.createElement('span');
          idSpan.className = 'data-card-id';
          idSpan.textContent = node.id;

          const titleDiv = document.createElement('div');
          titleDiv.className = 'data-card-title';
          titleDiv.textContent = node.title;

          const descDiv = document.createElement('div');
          descDiv.className = 'data-card-description';
          descDiv.textContent = node.category === 'segment' ? (node.summary || node.description) : node.description;

          // Build the card
          headerDiv.appendChild(titleDiv);
          headerDiv.appendChild(idSpan);
          card.appendChild(headerDiv);
          card.appendChild(descDiv);

          // Add timestamp info for segments
          if (node.category === 'segment' && (node.timestamp_start || node.timestamp_end)) {
            const metaDiv = document.createElement('div');
            metaDiv.className = 'data-card-meta';
            metaDiv.textContent = `Time: ${node.timestamp_start || '-'} to ${node.timestamp_end || '-'}`;
            card.appendChild(metaDiv);
          }

          // Add the card to container
          cardContainer.appendChild(card);

          // Add click handler
          card.onclick = () => {
            displayNodeInfo(node);
            if (network && nodesDataSet.get(node.id)) {
              network.focus(node.id, { scale: 1.5, animation: { duration: 800, easingFunction: 'easeInOutQuad' } });

              // Scroll to graph section
              if (isMobileDevice) {
                setTimeout(() => {
                  graphContainer.scrollIntoView({ behavior: 'smooth' });
                }, 300);
              }
            } else {
              alert("This node isn't currently visible in the graph based on your filters. Please adjust your filters to view it in the network.");
            }
          };
        }
      }
    });

    // Adjust segment table header if timestamps were added
    if (segmentsTableBody && segmentsTableBody.rows.length > 0 && segmentsTableBody.rows[0].cells.length > 3) {
      const headerRow = segmentsTableBody.rows[0];
      if (headerRow.cells[2].textContent !== "Summary") { // Ensure correct header for description/summary
        headerRow.cells[2].textContent = "Summary";
      }
    }
  }

  // --- JSON Export ---
  exportJsonButton.addEventListener('click', function () {
    exportJsonButton.classList.add('animate__animated', 'animate__pulse');

    const graphDataToExport = {
      nodes: allNodes.map(n => { // Reconstruct to original simpler format if needed
        const exportedNode = { id: n.id, name: n.title, category: n.category };
        if (n.category === 'segment') {
          exportedNode.summary = n.description; // Or n.summary if you distinguished them
          if (n.timestamp_start) exportedNode.timestamp_start = n.timestamp_start;
          if (n.timestamp_end) exportedNode.timestamp_end = n.timestamp_end;
        } else {
          exportedNode.description = n.description;
        }
        return exportedNode;
      }),
      edges: allEdges.map(e => ({
        source: e.from,
        target: e.to,
        label: e.label
      }))
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(graphDataToExport, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "sufi_wisdom_export.json");
    document.body.appendChild(downloadAnchorNode); // Required for Firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();

    setTimeout(() => {
      exportJsonButton.classList.remove('animate__animated', 'animate__pulse');
    }, 1000);
  });

  // Check viewport size on resize
  window.addEventListener('resize', function () {
    isMobileDevice = window.innerWidth <= 768;
    // Adjust zoom level and other params as needed
    if (network) {
      network.setOptions({
        nodes: {
          size: isMobileDevice ? 30 : 25,
          font: {
            size: isMobileDevice ? 16 : 14
          }
        }
      });
    }
  });

}); // End DOMContentLoaded