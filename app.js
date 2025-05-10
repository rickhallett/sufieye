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

  // Fixed zoom controls (always visible)
  const fixedZoomInBtn = document.getElementById('fixedZoomInBtn');
  const fixedZoomOutBtn = document.getElementById('fixedZoomOutBtn');
  const fixedFitBtn = document.getElementById('fixedFitBtn');

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
  let isStabilized = false; // Track if the network is stabilized
  let isUserInteracting = false; // Track if user is currently interacting with the graph
  let interactionTimeout = null; // For tracking interaction state

  // --- Color Settings ---
  const colors = {
    concept: { background: '#18103B', border: '#291960', highlight: { background: '#291960', border: '#3a277e' }, hover: { background: '#291960', border: '#3a277e' } },
    practice: { background: '#103B26', border: '#1a5c3b', highlight: { background: '#1a5c3b', border: '#256d4b' }, hover: { background: '#1a5c3b', border: '#256d4b' } },
    analogy: { background: '#966720', border: '#b7832e', highlight: { background: '#b7832e', border: '#d69f3c' }, hover: { background: '#b7832e', border: '#d69f3c' } },
    segment: { background: '#3B1016', border: '#5e1a23', highlight: { background: '#5e1a23', border: '#7d2531' }, hover: { background: '#5e1a23', border: '#7d2531' } }
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

    // Calculate container dimensions
    const containerRect = graphContainer.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;

    // Create more natural graph layout for better user experience
    const options = {
      layout: {
        improvedLayout: false, // Disable improvedLayout as it's causing issues
        randomSeed: 42, // Consistent layout
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
        navigationButtons: false, // Disable built-in navigation buttons
        keyboard: !isMobileDevice,
        multiselect: !isMobileDevice,
        selectable: true,
        zoomView: true,
        dragView: true,
        hideEdgesOnDrag: isMobileDevice,
        hideEdgesOnZoom: isMobileDevice,
        dragNodes: !isMobileDevice || containerWidth > 400
      },
      physics: {
        enabled: true,
        solver: 'forceAtlas2Based',
        stabilization: {
          enabled: true,
          iterations: 500,
          updateInterval: 25,
          fit: true
        },
        forceAtlas2Based: {
          gravitationalConstant: -35,
          centralGravity: 0.015,
          springLength: isMobileDevice ? 120 : 150,
          springConstant: 0.05,
          damping: 0.7,
          avoidOverlap: 0.5
        }
      },
      configure: {
        enabled: false
      }
    };

    // Create the network with fixed options
    if (network && typeof network.destroy === 'function') {
      network.destroy(); // Clean up any existing network instance
    }

    // Create new network
    network = new vis.Network(graphContainer, data, options);

    // Set up fixed zoom controls (always visible)
    setupFixedZoomControls();

    // Initial fit with a slight delay to allow rendering
    setTimeout(() => {
      try {
        network.fit({
          animation: {
            duration: 1000,
            easingFunction: 'easeOutQuint'
          }
        });
      } catch (e) {
        console.error("Error during initial fit:", e);
      }
    }, 500);

    // Setup basic event listeners
    setupBasicEventHandlers();

    // Handle mobile touch events
    if (isMobileDevice) {
      setupMobileTouchHandlers();
    }

    // After stabilization, disable physics to prevent jumping
    network.on("stabilizationIterationsDone", function () {
      setTimeout(() => {
        try {
          network.fit({
            animation: {
              duration: 800,
              easingFunction: 'easeOutQuint'
            }
          });

          // Disable physics after stabilization to prevent jumping
          network.setOptions({ physics: { enabled: false } });
          isStabilized = true;
        } catch (e) {
          console.error("Error during stabilization:", e);
        }
      }, 500);
    });
  }

  // Setup fixed zoom controls that are always visible
  function setupFixedZoomControls() {
    if (!network) return;

    // Find the elements; if they don't exist yet, create them dynamically
    let fixedZoomInBtn = document.getElementById('fixedZoomInBtn');
    let fixedZoomOutBtn = document.getElementById('fixedZoomOutBtn');
    let fixedFitBtn = document.getElementById('fixedFitBtn');

    // If buttons don't exist, create them dynamically
    if (!fixedFitBtn) {
      fixedFitBtn = document.createElement('button');
      fixedFitBtn.id = 'fixedFitBtn';
      fixedFitBtn.className = 'fixed-zoom-btn fixed-zoom-top-right';
      fixedFitBtn.title = 'Fit Graph';
      fixedFitBtn.innerHTML = '<i class="fas fa-expand"></i>';
      graphContainer.appendChild(fixedFitBtn);
    }

    if (!fixedZoomOutBtn) {
      fixedZoomOutBtn = document.createElement('button');
      fixedZoomOutBtn.id = 'fixedZoomOutBtn';
      fixedZoomOutBtn.className = 'fixed-zoom-btn fixed-zoom-bottom-left';
      fixedZoomOutBtn.title = 'Zoom Out';
      fixedZoomOutBtn.innerHTML = '<i class="fas fa-minus"></i>';
      graphContainer.appendChild(fixedZoomOutBtn);
    }

    if (!fixedZoomInBtn) {
      fixedZoomInBtn = document.createElement('button');
      fixedZoomInBtn.id = 'fixedZoomInBtn';
      fixedZoomInBtn.className = 'fixed-zoom-btn fixed-zoom-bottom-right';
      fixedZoomInBtn.title = 'Zoom In';
      fixedZoomInBtn.innerHTML = '<i class="fas fa-plus"></i>';
      graphContainer.appendChild(fixedZoomInBtn);
    }

    // Set up event listeners for the fixed controls
    fixedZoomInBtn = document.getElementById('fixedZoomInBtn');
    if (fixedZoomInBtn) {
      // Remove existing listeners first to prevent duplicates
      const newZoomInBtn = fixedZoomInBtn.cloneNode(true);
      if (fixedZoomInBtn.parentNode) {
        fixedZoomInBtn.parentNode.replaceChild(newZoomInBtn, fixedZoomInBtn);
      }

      newZoomInBtn.addEventListener('click', function (e) {
        e.stopPropagation(); // Prevent event bubbling
        try {
          const scale = network.getScale() * 1.2;
          network.moveTo({ scale: scale, animation: { duration: 300, easingFunction: 'easeOutQuad' } });
        } catch (err) {
          console.error("Error in fixed zoom in:", err);
        }
      });
    }

    fixedZoomOutBtn = document.getElementById('fixedZoomOutBtn');
    if (fixedZoomOutBtn) {
      // Remove existing listeners first to prevent duplicates
      const newZoomOutBtn = fixedZoomOutBtn.cloneNode(true);
      if (fixedZoomOutBtn.parentNode) {
        fixedZoomOutBtn.parentNode.replaceChild(newZoomOutBtn, fixedZoomOutBtn);
      }

      newZoomOutBtn.addEventListener('click', function (e) {
        e.stopPropagation(); // Prevent event bubbling
        try {
          const scale = network.getScale() * 0.8;
          network.moveTo({ scale: scale, animation: { duration: 300, easingFunction: 'easeOutQuad' } });
        } catch (err) {
          console.error("Error in fixed zoom out:", err);
        }
      });
    }

    fixedFitBtn = document.getElementById('fixedFitBtn');
    if (fixedFitBtn) {
      // Remove existing listeners first to prevent duplicates
      const newFitBtn = fixedFitBtn.cloneNode(true);
      if (fixedFitBtn.parentNode) {
        fixedFitBtn.parentNode.replaceChild(newFitBtn, fixedFitBtn);
      }

      newFitBtn.addEventListener('click', function (e) {
        e.stopPropagation(); // Prevent event bubbling
        try {
          network.fit({ animation: { duration: 600, easingFunction: 'easeOutQuad' } });
        } catch (err) {
          console.error("Error in fixed fit:", err);
        }
      });
    }
  }

  // Setup only essential event handlers
  function setupBasicEventHandlers() {
    if (!network) return;

    // Clear previous events
    network.off("click");
    network.off("hoverNode");
    network.off("blurNode");

    // Handle node click to display info
    network.on('click', function (params) {
      clearInfoPanel();
      if (params.nodes && params.nodes.length > 0) {
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
      try {
        const nodeId = params.node;
        const node = nodesDataSet.get(nodeId);
        if (node) {
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
        }
      } catch (e) {
        console.error("Error in hoverNode:", e);
      }
    });

    // Remove glow on blur
    network.on('blurNode', function (params) {
      try {
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
      } catch (e) {
        console.error("Error in blurNode:", e);
      }
    });

    // Simple window resize handler
    const handleResize = function () {
      isMobileDevice = window.innerWidth <= 768;

      // Simple fit operation on resize
      if (network) {
        setTimeout(() => {
          try {
            network.fit({
              animation: {
                duration: 500,
                easingFunction: 'easeOutCubic'
              }
            });
          } catch (e) {
            console.error("Error during resize fit:", e);
          }
        }, 250);
      }
    };

    // Remove existing and add clean resize handler
    window.removeEventListener('resize', handleResize);
    window.addEventListener('resize', handleResize);
  }

  // Simple mobile touch handlers with minimal interference
  function setupMobileTouchHandlers() {
    // Clear any existing handlers
    const graphContainerEl = document.getElementById('graph-container');
    if (!graphContainerEl || !network) return;

    // Store the original zoom control buttons to avoid duplication
    const zoomInBtn = document.getElementById('zoomInBtn');
    const zoomOutBtn = document.getElementById('zoomOutBtn');
    const fitBtn = document.getElementById('fitBtn');

    // Check if all buttons exist before proceeding
    if (!zoomInBtn || !zoomOutBtn || !fitBtn) {
      console.warn("Mobile control buttons not found. Mobile controls will be limited.");
      return;
    }

    // Clean old handlers
    const newZoomInBtn = zoomInBtn.cloneNode(true);
    const newZoomOutBtn = zoomOutBtn.cloneNode(true);
    const newFitBtn = fitBtn.cloneNode(true);

    zoomInBtn.parentNode.replaceChild(newZoomInBtn, zoomInBtn);
    zoomOutBtn.parentNode.replaceChild(newZoomOutBtn, zoomOutBtn);
    fitBtn.parentNode.replaceChild(newFitBtn, fitBtn);

    // Add new simple handlers
    newZoomInBtn.addEventListener('click', function () {
      try {
        const scale = network.getScale() * 1.2;
        network.moveTo({ scale: scale, animation: { duration: 300, easingFunction: 'easeOutQuad' } });
      } catch (e) {
        console.error("Error in zoom in:", e);
      }
    });

    newZoomOutBtn.addEventListener('click', function () {
      try {
        const scale = network.getScale() * 0.8;
        network.moveTo({ scale: scale, animation: { duration: 300, easingFunction: 'easeOutQuad' } });
      } catch (e) {
        console.error("Error in zoom out:", e);
      }
    });

    newFitBtn.addEventListener('click', function () {
      try {
        network.fit({ animation: { duration: 800, easingFunction: 'easeOutQuad' } });
      } catch (e) {
        console.error("Error in fit:", e);
      }
    });

    // Show the network controls overlay for mobile
    const networkControls = document.querySelector('.network-controls-overlay');
    if (networkControls) {
      networkControls.style.display = 'flex';
    }
  }

  // Initialize mobile navigation controls
  function initializeMobileControls() {
    if (!isMobileDevice) return;

    // Make sure all required elements exist
    const zoomInBtn = document.getElementById('zoomInBtn');
    const zoomOutBtn = document.getElementById('zoomOutBtn');
    const fitBtn = document.getElementById('fitBtn');
    const graphNavBtn = document.getElementById('graphNavBtn');
    const viewInfoBtn = document.getElementById('viewInfoBtn');
    const viewCatalogBtn = document.getElementById('viewCatalogBtn');
    const searchBtn = document.getElementById('searchBtn');
    const networkControlsOverlay = document.querySelector('.network-controls-overlay');

    if (!network || !networkControlsOverlay) {
      console.warn("Required elements for mobile controls not found");
      return;
    }

    // Graph navigation buttons
    if (zoomInBtn) {
      zoomInBtn.addEventListener('click', function () {
        const scale = network.getScale() * 1.2;
        network.moveTo({ scale: scale, animation: true });
      });
    }

    if (zoomOutBtn) {
      zoomOutBtn.addEventListener('click', function () {
        const scale = network.getScale() * 0.8;
        network.moveTo({ scale: scale, animation: true });
      });
    }

    if (fitBtn) {
      fitBtn.addEventListener('click', function () {
        network.fit({ animation: { duration: 800, easingFunction: 'easeInOutQuad' } });
      });
    }

    // Bottom navigation buttons
    if (graphNavBtn && networkControlsOverlay && graphSection) {
      graphNavBtn.addEventListener('click', function () {
        networkControlsOverlay.style.display = networkControlsOverlay.style.display === 'flex' ? 'none' : 'flex';
        graphSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }

    if (viewInfoBtn && infoSection) {
      viewInfoBtn.addEventListener('click', function () {
        infoSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }

    if (viewCatalogBtn && tablesSection) {
      viewCatalogBtn.addEventListener('click', function () {
        tablesSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }

    if (searchBtn && searchInput) {
      searchBtn.addEventListener('click', function () {
        // Focus on search input and scroll to controls
        searchInput.focus();
        const controls = document.querySelector('.controls');
        if (controls) {
          controls.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    }

    // Detect orientation changes to adjust layout
    window.addEventListener('orientationchange', function () {
      setTimeout(() => {
        if (network) {
          network.fit({ animation: true });
        }
      }, 300);
    });

    // Hide navigation overlay when clicking outside
    if (networkControlsOverlay && graphNavBtn) {
      document.addEventListener('click', function (event) {
        if (networkControlsOverlay.style.display === 'flex' &&
          !networkControlsOverlay.contains(event.target) &&
          event.target !== graphNavBtn) {
          networkControlsOverlay.style.display = 'none';
        }
      });
    }
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