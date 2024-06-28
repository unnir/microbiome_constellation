// Global variables
let graph, svg, g, simulation, link, node, label, width, height, zoomBehavior;
let currentFeature = null;
let visibleGraph = { nodes: [], links: [] };

// Initialize the graph
function initializeGraph(loadedGraph) {
    graph = loadedGraph;
    width = window.innerWidth;
    height = window.innerHeight;

    setupSVG();
    setupSimulation();
    createGraphElements();
    setupEventListeners();
    populateFeatureList();
}

function setupSVG() {
    svg = d3.select("#graph").append("svg")
        .attr("width", width)
        .attr("height", height);

    zoomBehavior = d3.zoom()
        .scaleExtent([0.1, 8])
        .on("zoom", zoomed);

    svg.call(zoomBehavior);
    g = svg.append("g");
}

function setupSimulation() {
    simulation = d3.forceSimulation()
        .force("link", d3.forceLink().id(d => d.id).distance(200).strength(0.5))
        .force("charge", d3.forceManyBody().strength(-800))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collision", d3.forceCollide().radius(50))
        .alpha(0.3);
}

function createGraphElements() {
    link = g.append("g")
        .attr("class", "links")
        .selectAll("line");

    node = g.append("g")
        .attr("class", "nodes")
        .selectAll("circle");

    label = g.append("g")
        .attr("class", "labels")
        .selectAll("text");

    updateGraphElements(graph.nodes, graph.links);
}

function updateGraphElements(nodes, links) {
    const color = d3.scaleOrdinal(d3.schemeCategory10);

    // Update links
    link = link.data(links, d => `${d.source.id}-${d.target.id}`);
    link.exit().remove();
    link = link.enter().append("line")
        .merge(link)
        .attr("stroke-width", d => Math.sqrt(d.value))
        .attr("stroke", "#999")
        .attr("stroke-opacity", 0.6);

    // Update nodes
    node = node.data(nodes, d => d.id);
    node.exit().remove();
    node = node.enter().append("circle")
        .attr("r", 10)
        .attr("fill", d => color(d.group || 0))
        .call(d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended))
        .merge(node);

    node.append("title")
        .text(d => d.id);

    // Update labels
    label = label.data(nodes, d => d.id);
    label.exit().remove();
    label = label.enter().append("text")
        .attr("dx", 12)
        .attr("dy", ".35em")
        .merge(label)
        .text(d => d.id)
        .style("font-size", "16px")
        .style("fill", "#333");

    // Update and restart the simulation
    simulation.nodes(nodes).on("tick", ticked);
    simulation.force("link").links(links);
    simulation.alpha(1).restart();
}

function updateVisibleGraph() {
    const threshold = parseFloat(document.getElementById("thresholdSlider").value);
    document.getElementById("thresholdValue").textContent = threshold.toFixed(2);

    let filteredLinks = graph.links.filter(link => link.value > threshold);
    let connectedNodeIds = new Set(filteredLinks.flatMap(link => [link.source.id, link.target.id]));

    if (currentFeature) {
        filteredLinks = filteredLinks.filter(link => 
            link.source.id === currentFeature || link.target.id === currentFeature
        );
        connectedNodeIds = new Set(filteredLinks.flatMap(link => [link.source.id, link.target.id]));
        visibleGraph.nodes = graph.nodes.filter(node => 
            connectedNodeIds.has(node.id) || node.id === currentFeature
        );
    } else {
        visibleGraph.nodes = graph.nodes.filter(node => connectedNodeIds.has(node.id));
    }

    visibleGraph.links = filteredLinks;
    updateGraphElements(visibleGraph.nodes, visibleGraph.links);
}

function setupEventListeners() {
    window.addEventListener("resize", debounce(updateGraphSize));
    document.getElementById("thresholdSlider").addEventListener("input", updateVisibleGraph);
    document.getElementById("filterButton").addEventListener("click", applyFeatureFilter);
    document.getElementById("resetGraph").addEventListener("click", resetGraph);
    document.getElementById("closeInfoWindow").addEventListener("click", closeInfoWindow);
    document.getElementById("themeToggle").addEventListener("click", toggleTheme);
    
    // Add search functionality
    const searchInput = document.getElementById("featureInput");
    searchInput.addEventListener("input", function() {
        const searchTerm = this.value.toLowerCase();
        if (searchTerm === "") {
            resetNodeFocus();
        } else {
            node.attr("opacity", d => d.id.toLowerCase().includes(searchTerm) ? 1 : 0.3)
                .attr("r", d => d.id.toLowerCase().includes(searchTerm) ? 15 : 10);
            label.attr("opacity", d => d.id.toLowerCase().includes(searchTerm) ? 1 : 0.3)
                 .attr("font-size", d => d.id.toLowerCase().includes(searchTerm) ? "12px" : "8px")
                 .attr("font-weight", d => d.id.toLowerCase().includes(searchTerm) ? "bold" : "normal");
        }
    });
}

function applyFeatureFilter() {
    const selectedNodeId = document.getElementById("featureInput").value;
    if (selectedNodeId) {
        focusOnNode(selectedNodeId);
    } else {
        resetNodeFocus();
    }
}

function focusOnNode(nodeId) {
    const selectedNode = graph.nodes.find(n => n.id === nodeId);
    if (!selectedNode) return;

    // Center view on the selected node
    const transform = d3.zoomTransform(svg.node());
    const scale = transform.k;
    const x = -selectedNode.x * scale + width / 2;
    const y = -selectedNode.y * scale + height / 2;
    svg.transition().duration(750).call(
        zoomBehavior.transform,
        d3.zoomIdentity.translate(x, y).scale(scale)
    );

    // Find all nodes in the connected cluster using BFS
    const connectedCluster = findConnectedCluster(nodeId);

    // Highlight the connected cluster
    node.attr("opacity", d => connectedCluster.has(d.id) ? 1 : 0.1)
        .attr("r", d => d.id === nodeId ? 15 : (connectedCluster.has(d.id) ? 10 : 5));

    link.attr("opacity", d => connectedCluster.has(d.source.id) && connectedCluster.has(d.target.id) ? 1 : 0.1)
        .attr("stroke-width", d => (connectedCluster.has(d.source.id) && connectedCluster.has(d.target.id)) ? 
                                   Math.sqrt(d.value) * 2 : Math.sqrt(d.value));

    label.attr("opacity", d => connectedCluster.has(d.id) ? 1 : 0.1)
        .attr("font-size", d => d.id === nodeId ? "14px" : (connectedCluster.has(d.id) ? "10px" : "8px"))
        .attr("font-weight", d => d.id === nodeId ? "bold" : "normal");
}

function findConnectedCluster(startNodeId) {
    const connectedCluster = new Set([startNodeId]);
    const queue = [startNodeId];

    while (queue.length > 0) {
        const currentNodeId = queue.shift();
        graph.links.forEach(link => {
            let neighborId;
            if (link.source.id === currentNodeId) {
                neighborId = link.target.id;
            } else if (link.target.id === currentNodeId) {
                neighborId = link.source.id;
            }
            
            if (neighborId && !connectedCluster.has(neighborId)) {
                connectedCluster.add(neighborId);
                queue.push(neighborId);
            }
        });
    }

    return connectedCluster;
}


function resetNodeFocus() {
    node.attr("opacity", 1).attr("r", 10);
    link.attr("opacity", 0.6).attr("stroke-width", d => Math.sqrt(d.value));
    label.attr("opacity", 1).attr("font-size", "8px").attr("font-weight", "normal");
}

function resetGraph() {
    currentFeature = null;
    document.getElementById("thresholdSlider").value = 0.05;
    document.getElementById("thresholdValue").textContent = "0.05";
    document.getElementById("featureInput").value = "";
    updateVisibleGraph();
    resetNodeFocus();
    
    // Reset zoom
    svg.transition().duration(750).call(
        zoomBehavior.transform,
        d3.zoomIdentity,
        d3.zoomTransform(svg.node()).invert([width / 2, height / 2])
    );
}

function populateFeatureList() {
    const featureList = d3.select("#featureList");
    graph.nodes.forEach(node => {
        featureList.append("option").attr("value", node.id);
    });
}

// Theme toggling function
function toggleTheme() {
    const body = document.body;
    const themeIcon = document.querySelector("#themeToggle i");
    
    if (body.classList.contains("dark-theme")) {
        body.classList.remove("dark-theme");
        themeIcon.classList.replace("fa-sun", "fa-moon");
        localStorage.setItem("theme", "light");
    } else {
        body.classList.add("dark-theme");
        themeIcon.classList.replace("fa-moon", "fa-sun");
        localStorage.setItem("theme", "dark");
    }
    
    // Update graph colors
    updateGraphColors();
}

// Function to update graph colors based on the current theme
function updateGraphColors() {
    const isDarkTheme = document.body.classList.contains("dark-theme");
    const linkColor = getComputedStyle(document.body).getPropertyValue('--link-color');
    const nodeColor = getComputedStyle(document.body).getPropertyValue('--node-color');
    const textColor = getComputedStyle(document.body).getPropertyValue('--text-color');

    link.attr("stroke", linkColor);
    node.attr("fill", d => isDarkTheme ? d3.rgb(nodeColor).brighter(0.5) : d3.rgb(nodeColor).darker(0.5));
    label.attr("fill", textColor);
}

function setInitialTheme() {
    const savedTheme = localStorage.getItem("theme");
    const prefersDarkScheme = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const themeIcon = document.querySelector("#themeToggle i");

    if (savedTheme === "dark" || (savedTheme === null && prefersDarkScheme)) {
        document.body.classList.add("dark-theme");
        themeIcon.classList.replace("fa-moon", "fa-sun");
    }
}

// Utility functions
function debounce(func, timeout = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => func.apply(this, args), timeout);
    };
}

function updateGraphSize() {
    width = window.innerWidth;
    height = window.innerHeight;
    svg.attr("width", width).attr("height", height);
    simulation.force("center", d3.forceCenter(width / 2, height / 2));
    simulation.alpha(1).restart();
}

function zoomed(event) {
    g.attr("transform", event.transform);
}

function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
}

function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
}

function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
}

function ticked() {
    link
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);

    node
        .attr("cx", d => d.x)
        .attr("cy", d => d.y);

    label
        .attr("x", d => d.x)
        .attr("y", d => d.y);
}

// Load data and initialize
d3.json("graph_causal.json").then(loadedGraph => {
    console.log("Loaded graph:", loadedGraph);
    initializeGraph(loadedGraph);
    updateVisibleGraph();
    setInitialTheme();
    updateGraphColors();
    document.getElementById("currentYear").textContent = new Date().getFullYear();
});

// Info window functions
function openInfoWindow() {
    document.getElementById("infoWindow").style.display = "block";
}

function closeInfoWindow() {
    document.getElementById("infoWindow").style.display = "none";
}

// Open the info window on page load
window.onload = openInfoWindow;