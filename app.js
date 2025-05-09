// app.js

document.addEventListener('DOMContentLoaded', function () {
  // --- DOM Elements ---
  const graphContainer = document.getElementById('graph-container');
  const searchInput = document.getElementById('searchInput');
  const categoryFilter = document.getElementById('categoryFilter');
  const exportJsonButton = document.getElementById('exportJsonButton');

  // Info Panel Elements
  const nodeIdDisplay = document.getElementById('node-id-display');
  const nodeNameDisplay = document.getElementById('node-name-display');
  const nodeCategoryDisplay = document.getElementById('node-category-display');
  const nodeDescriptionDisplay = document.getElementById('node-description-display');
  const nodeConnectionsList = document.getElementById('node-connections-list');
  const nodeSegmentsList = document.getElementById('node-segments-list');

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
        label: node.name.length > 25 ? node.name.substring(0, 22) + '...' : node.name, // Truncate long labels
        title: node.name, // Full name on hover
        group: node.category, // For Vis.js group styling
        category: node.category,
        description: node.description || node.summary || '',
        timestamp_start: node.timestamp_start, // For segments
        timestamp_end: node.timestamp_end     // For segments
      }));

      allEdges = data.edges.map(edge => ({
        from: edge.source,
        to: edge.target,
        label: edge.label,
        arrows: 'to',
        font: { align: 'middle', size: 10 },
        color: { color: '#848484', highlight: '#ff0000', hover: '#d3d3d3' }
      }));

      // Initialize DataSet for Vis.js (these will be filtered later)
      nodesDataSet.add(allNodes);
      edgesDataSet.add(allEdges);

      initializeGraph();
      populateTables();
    })
    .catch(error => {
      console.error('Error loading graph data:', error);
      graphContainer.innerHTML = `<p style="color:red; text-align:center;">Error loading graph data. Make sure 'graph-data.json' exists and is valid. Details: ${error.message}</p>`;
    });

  // --- Graph Initialization ---
  function initializeGraph() {
    const data = {
      nodes: nodesDataSet,
      edges: edgesDataSet
    };
    const options = {
      layout: {
        improvedLayout: true,
        // hierarchical: {
        //     enabled: false, // Set to true for hierarchical layout
        //     sortMethod: 'directed'
        // }
      },
      edges: {
        smooth: {
          type: 'cubicBezier',
          forceDirection: 'horizontal',
          roundness: 0.4
        },
        arrows: { to: { enabled: true, scaleFactor: 0.7 } },
        font: {
          size: 10,
          color: '#555',
          strokeWidth: 0 // No stroke around edge labels for cleaner look
        }
      },
      nodes: {
        shape: 'ellipse', // Default shape
        font: {
          size: 12,
          face: 'Arial',
          color: '#333'
        },
        borderWidth: 1.5,
        shadow: { // Subtle shadow for depth
          enabled: true,
          color: 'rgba(0,0,0,0.2)',
          size: 5,
          x: 2,
          y: 2
        }
      },
      groups: {
        concept: { color: { background: '#85c1e9', border: '#3498db' }, shape: 'box', font: { color: '#2c3e50' } },
        practice: { color: { background: '#82e0aa', border: '#2ecc71' }, shape: 'ellipse', font: { color: '#1e8449' } },
        analogy: { color: { background: '#f7dc6f', border: '#f1c40f' }, shape: 'diamond', font: { color: '#b7950b' } },
        segment: { color: { background: '#f5b041', border: '#e67e22' }, shape: 'dot', size: 12, font: { color: '#af601a' } }
      },
      interaction: {
        hover: true,
        tooltipDelay: 200,
        navigationButtons: true, // Adds zoom and fit buttons
        keyboard: true // Enables keyboard navigation
      },
      physics: {
        enabled: true,
        solver: 'barnesHut', // Good general-purpose solver
        barnesHut: {
          gravitationalConstant: -2500,
          centralGravity: 0.1,
          springLength: 120,
          springConstant: 0.05,
          damping: 0.09
        },
        stabilization: { // Speed up initial layout
          iterations: 1000,
          fit: true
        }
      }
    };
    network = new vis.Network(graphContainer, data, options);

    // --- Event Listeners for Graph Interaction ---
    network.on('click', function (params) {
      clearInfoPanel(); // Clear previous info
      if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        const selectedNode = allNodes.find(n => n.id === nodeId); // Find in the original full data
        if (selectedNode) {
          displayNodeInfo(selectedNode);
        }
      }
    });

    network.on("stabilizationIterationsDone", function () {
      network.setOptions({ physics: false }); // Turn off physics after initial layout for performance
    });
  }

  // --- Display Node Information ---
  function displayNodeInfo(node) {
    nodeIdDisplay.textContent = node.id;
    nodeNameDisplay.textContent = node.title; // Full name
    nodeCategoryDisplay.textContent = node.category.charAt(0).toUpperCase() + node.category.slice(1); // Capitalize
    nodeDescriptionDisplay.textContent = node.description;

    // Display connections
    nodeConnectionsList.innerHTML = ''; // Clear previous
    const connectedEdges = allEdges.filter(edge => edge.from === node.id || edge.to === node.id);

    connectedEdges.forEach(edge => {
      const li = document.createElement('li');
      let connectedNodeId, connectedNodeName, directionLabel;

      if (edge.from === node.id) {
        connectedNodeId = edge.to;
        directionLabel = `--- ${edge.label || ''} --->`;
      } else {
        connectedNodeId = edge.from;
        directionLabel = `<--- ${edge.label || ''} ---`;
      }

      const connectedNode = allNodes.find(n => n.id === connectedNodeId);
      connectedNodeName = connectedNode ? connectedNode.title : connectedNodeId;

      li.textContent = `${directionLabel} ${connectedNodeName} (${connectedNodeId})`;
      li.style.cursor = 'pointer';
      li.onclick = () => { // Allow clicking on connected nodes in the list
        const nodeToFocus = allNodes.find(n => n.id === connectedNodeId);
        if (nodeToFocus) {
          displayNodeInfo(nodeToFocus);
          network.focus(nodeToFocus.id, { scale: 1.2, animation: true });
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
          li.style.cursor = 'pointer';
          li.onclick = () => {
            displayNodeInfo(segmentNode);
            network.focus(segmentNode.id, { scale: 1.2, animation: true });
          };
          nodeSegmentsList.appendChild(li);
        }
      });
      if (tiedSegmentEdges.length === 0) {
        nodeSegmentsList.innerHTML = '<li>No segments directly tied via explicit edges.</li>';
      }
    } else {
      nodeSegmentsList.innerHTML = '<li>N/A for this node type.</li>';
    }
  }

  function clearInfoPanel() {
    nodeIdDisplay.textContent = '-';
    nodeNameDisplay.textContent = '-';
    nodeCategoryDisplay.textContent = '-';
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
        const categoryMatch = selectedCategory === 'all' || node.category === selectedCategory;
        return nameMatch && categoryMatch;
      })
      .map(node => node.id);

    // Update Vis.js DataSet to show only filtered nodes and relevant edges
    nodesDataSet.clear();
    nodesDataSet.add(allNodes.filter(node => filteredNodeIds.includes(node.id)));

    edgesDataSet.clear();
    edgesDataSet.add(allEdges.filter(edge =>
      filteredNodeIds.includes(edge.from) && filteredNodeIds.includes(edge.to)
    ));
    // If you want physics to re-layout after filtering:
    // network.setOptions({ physics: true });
    // network.stabilize(); // Then turn off again if desired
  }

  searchInput.addEventListener('input', applyFilters); // 'input' for real-time filtering
  categoryFilter.addEventListener('change', applyFilters);

  // --- Populate HTML Tables ---
  function populateTables() {
    const tableBodies = {
      concept: conceptsTableBody,
      practice: practicesTableBody,
      analogy: analogiesTableBody,
      segment: segmentsTableBody
    };

    // Clear existing rows
    for (const category in tableBodies) {
      if (tableBodies[category]) tableBodies[category].innerHTML = '';
    }

    allNodes.forEach(node => {
      const tableBody = tableBodies[node.category];
      if (tableBody) {
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


        row.style.cursor = 'pointer';
        row.onclick = () => { // Click table row to focus on graph and show info
          displayNodeInfo(node);
          if (network && nodesDataSet.get(node.id)) { // Check if node is currently in the filtered graph
            network.focus(node.id, { scale: 1.5, animation: true });
          } else {
            // If node is filtered out, you might want to temporarily add it or clear filters
            // For simplicity here, we just show info.
            console.log("Node not currently in filtered graph view, but info shown.");
          }
        };
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
    downloadAnchorNode.setAttribute("download", "sufi_graph_export.json");
    document.body.appendChild(downloadAnchorNode); // Required for Firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  });

}); // End DOMContentLoaded