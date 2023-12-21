let graph, svg, g, simulation, link, node, label, width, height, zoomBehavior;
let resizeTimeout;

let currentFeature = null; // Add a state to keep track of the selected feature
let visibleGraph = { nodes: [], links: [] }; // Currently visible nodes and links

// This function updates the visibleGraph state and the graph visuals
function updateVisibleGraph() {
    let filteredLinks = graph.links.filter(link => link.value > thresholdSlider.value);
    let connectedNodeIds = new Set(filteredLinks.flatMap(link => [link.source.id, link.target.id]));

    if (currentFeature !== null) {
        // Filter for a specific feature and its connections
        filteredLinks = filteredLinks.filter(link => 
            link.source.id === currentFeature || link.target.id === currentFeature
        );
        connectedNodeIds = new Set(filteredLinks.flatMap(link => [link.source.id, link.target.id]));
        visibleGraph.nodes = graph.nodes.filter(node => 
            connectedNodeIds.has(node.id) || node.id === currentFeature
        );
    } else {
        // No specific feature selected, show all nodes connected by the filtered links
        visibleGraph.nodes = graph.nodes.filter(node => connectedNodeIds.has(node.id));
    }

    visibleGraph.links = filteredLinks;
    updateGraphElements(visibleGraph.nodes, visibleGraph.links);
}

// Debounce function for resize events
function debounce(func, timeout = 300) {
    return (...args) => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => { func.apply(this, args); }, timeout);
    };
}
// Function to update the graph size
function updateGraphSize() {
    width = window.innerWidth;
    height = window.innerHeight;

    svg.attr("width", width).attr("height", height);
    simulation.force("center", d3.forceCenter(width / 2, height / 2));
    simulation.alpha(1).restart();
}

// Initialize the graph
function initializeGraph(loadedGraph) {
    graph = loadedGraph;
    width = window.innerWidth;
    height = window.innerHeight;

    // Populate datalist with feature names
    const featureList = d3.select("#featureList");
    const nodeById = mapNodesById(graph.nodes);

    graph.nodes.forEach(node => {
        featureList.append("option").attr("value", node.id);
    });

    // Map source and target for each link to node objects for the initial load
    graph.links.forEach(link => {
        link.source = typeof link.source === 'object' ? link.source : nodeById[link.source];
        link.target = typeof link.target === 'object' ? link.target : nodeById[link.target];
    });


    // Create SVG element
    svg = d3.select("#graph").append("svg")
        .attr("width", width)
        .attr("height", height);


    // Initialize zoomBehavior here
    zoomBehavior = d3.zoom()
        .scaleExtent([0.1, 4])  
        .on("zoom", zoomed);

    svg.call(zoomBehavior);

    g = svg.append("g");


    // Set up the force simulation
    simulation = d3.forceSimulation()
        .force("link", d3.forceLink().id(function(d) { return d.id; }).distance(100).strength(0.1))
        .force("charge", d3.forceManyBody().strength(-50))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .alpha(0.3); // Lower initial alpha for smoother start


    // Create links
    link = g.append("g")
        .attr("class", "links")
        .selectAll("line")
        .data(graph.links)
        .enter().append("line")
        .attr("stroke-width", function(d) { return Math.sqrt(d.value); });

    // Create nodes
    node = g.append("g")
        .attr("class", "nodes")
        .selectAll("circle")
        .data(graph.nodes)
        .enter().append("circle")
        .attr("r", 5)
        .attr("fill", "blue")
        .call(d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended));

    // Add labels to each node
    label = g.append("g")
        .attr("class", "labels")
        .selectAll("text")
        .data(graph.nodes)
        .enter().append("text")
        .attr("dx", 12)
        .attr("dy", ".35em")
        .text(function(d) { return d.id });


    // Add forces to the nodes and links
    simulation
        .nodes(graph.nodes)
        .on("tick", ticked);

    simulation.force("link")
        .links(graph.links);

    // Handle window resizing


    window.addEventListener("resize", debounce(updateGraphSize));
}


// Event listener for the filter button
document.getElementById("filterButton").addEventListener("click", function() {
    const featureName = document.getElementById("featureInput").value;
    currentFeature = featureName; // Update the current feature state
    updateGraph(featureName);
});

// Function to map nodes by their id
function mapNodesById(nodes) {
    let map = {};
    nodes.forEach(node => {
        map[node.id] = node;
    });
    return map;
}

function updateGraphElements(filteredNodes, filteredLinks) {
    // Check if there are no connected nodes for the selected feature
    if (currentFeature && filteredNodes.length === 0) {
        // Find the isolated node based on currentFeature
        const isolatedNode = graph.nodes.find(node => node.id === currentFeature);
        if (isolatedNode) {
            filteredNodes = [isolatedNode]; // Display only the isolated node
            filteredLinks = []; // No links to display
            // Center the isolated node
            isolatedNode.fx = width / 2;
            isolatedNode.fy = height / 2;
        }
    }

    // Update links
    link = svg.select(".links").selectAll("line")
        .data(filteredLinks, d => d.source.id + "-" + d.target.id);

    // Remove old links
    link.exit().remove();

    // Add new links
    link.enter().append("line")
        .attr("class", "links")
        .attr("stroke-width", d => Math.sqrt(d.value))
        .merge(link) // Merge with existing links
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);

    // Update nodes
    node = svg.select(".nodes").selectAll("circle")
        .data(filteredNodes, d => d.id);

    // Remove old nodes
    node.exit().remove();

    // Add new nodes
    node.enter().append("circle")
        .attr("class", "nodes")
        .attr("r", 5)
        .attr("fill", "blue")
        .call(d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended))
        .merge(node) // Merge with existing nodes
        .attr("cx", d => d.x)
        .attr("cy", d => d.y);

    // Update labels
    label = svg.select(".labels").selectAll("text")
        .data(filteredNodes, d => d.id);

    // Remove old labels
    label.exit().remove();

    // Add new labels
    label.enter().append("text")
        .attr("class", "labels")
        .attr("dx", 12)
        .attr("dy", ".35em")
        .merge(label) // Merge with existing labels
        .text(d => d.id)
        .attr("x", d => d.x)
        .attr("y", d => d.y);

    // Restart simulation with new nodes and links
    simulation.nodes(filteredNodes).on("tick", ticked);
    simulation.force("link").links(filteredLinks);
    simulation.alpha(1).restart();
}


function updateGraph(featureName) {
    let filteredNodes, filteredLinks;

    if (featureName) {
        // Filter for a specific feature and its connections
        filteredNodes = graph.nodes.filter(node => node.id === featureName);
        filteredLinks = graph.links.filter(link => link.source.id === featureName || link.target.id === featureName);

        const connectedNodeIds = new Set(filteredLinks.flatMap(link => [link.source.id, link.target.id]));
        filteredNodes = graph.nodes.filter(node => connectedNodeIds.has(node.id));

        // Store the current feature and its connections
        currentFeature = { nodes: filteredNodes, links: filteredLinks };
    } else {
        filteredNodes = graph.nodes;
        filteredLinks = graph.links;
        currentFeature = null; // Reset the feature state if no feature is selected
    }

    if (filteredNodes.length === 0) {
        const featureNode = graph.nodes.find(node => node.id === featureName);
        if (featureNode) {
            filteredNodes.push(featureNode); // Add only the selected node
        }
    }

    // Adjusting forces for a sparser layout
    const simulation = d3.forceSimulation()
    .force("link", d3.forceLink(filteredLinks)
    .id(d => d.id)
    .distance(120) // Increased distance for better separation
    .strength(0.4)) // Slightly adjusted strength for balance
    .force("charge", d3.forceManyBody()
    .strength(-150)) // Increased negative charge for stronger repulsion
    .force("center", d3.forceCenter(width / 2, height / 2));


    simulation.nodes(filteredNodes)
        .on("tick", ticked);

    simulation.alpha(1).restart();

    updateGraphElements(filteredNodes, filteredLinks);
}


d3.json("graph_data.json").then(loadedGraph => {
    console.log("Loaded graph:", loadedGraph); // Check the loaded graph structure
    initializeGraph(loadedGraph);
    applyThreshold(parseFloat(document.getElementById("thresholdSlider").value));
});


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

document.getElementById("thresholdSlider").addEventListener("input", function() {
    const thresholdValue = parseFloat(this.value);
    document.getElementById("thresholdValue").textContent = thresholdValue.toFixed(2);
    updateVisibleGraph();
});


// Modify the applyThreshold function to respect the currentFeature state
function applyThreshold(threshold) {
    console.log("Applying threshold with value:", threshold);

    if (isNaN(threshold)) {
        alert("Please enter a valid threshold value");
        return;
    }

    let filteredLinks;
    let filteredNodes;

    // If a feature is selected, apply the threshold only to its connections
    if (currentFeature) {
        filteredLinks = graph.links.filter(link => 
            (link.source.id === currentFeature || link.target.id === currentFeature) && link.value > threshold
        );

        const connectedNodeIds = new Set(filteredLinks.flatMap(link => [link.source.id, link.target.id]));

        // Check if the feature is connected to any node after applying the threshold
        if (connectedNodeIds.size > 0) {
            // Include the feature node itself and any connected nodes
            filteredNodes = graph.nodes.filter(node => 
                connectedNodeIds.has(node.id) || node.id === currentFeature
            );
        } else {
            // If no connections, just show the feature node
            filteredNodes = graph.nodes.filter(node => node.id === currentFeature);
            // Fix the feature node position to the center
            let featureNode = filteredNodes.find(node => node.id === currentFeature);
            if (featureNode) {
                featureNode.fx = width / 2;
                featureNode.fy = height / 2;
            }
        }
    } else {
        // If no feature is selected, apply the threshold to the entire graph
        filteredLinks = graph.links.filter(link => link.value > threshold);
        const connectedNodeIds = new Set(filteredLinks.flatMap(link => [link.source.id, link.target.id]));
        filteredNodes = graph.nodes.filter(node => connectedNodeIds.has(node.id));
    }

    // Update and restart the simulation with the filtered data
    simulation.nodes(filteredNodes);
    simulation.force("link").links(filteredLinks);
    simulation.alpha(1).restart();

    // Update nodes and links in the SVG
    updateGraphElements(filteredNodes, filteredLinks);
}


document.getElementById("filterButton").addEventListener("click", function() {
    const featureName = document.getElementById("featureInput").value;
    currentFeature = featureName;
    updateVisibleGraph();
});


// Separate functions for zoom in and zoom out
function zoomIn() {
    svg.transition().duration(500).call(zoomBehavior.scaleBy, 1.2);
}

function zoomOut() {
    svg.transition().duration(500).call(zoomBehavior.scaleBy, 0.8);
}


// Event listener for the reset button
document.getElementById("resetGraph").addEventListener("click", function() {
    resetGraph();
});

// Function to reset the graph to its initial state
// Call this function to reset the graph to its initial state
function resetGraph() {
    currentFeature = null;
    document.getElementById("thresholdSlider").value = 0.75; // Default threshold
    document.getElementById("thresholdValue").textContent = "0.75";
    updateVisibleGraph();
}

// Function to open the info window
function openInfoWindow() {
    document.getElementById("infoWindow").style.display = "block";
}

// Function to close the info window
function closeInfoWindow() {
    document.getElementById("infoWindow").style.display = "none";
}

// Event listener to close the info window
document.getElementById("closeInfoWindow").addEventListener("click", closeInfoWindow);

// Open the info window on page load (optional)
window.onload = openInfoWindow;


// Define the zoomed function
function zoomed(event) {
    g.attr("transform", event.transform);
}
