// --- Globals for Chart Instances ---
let costChartInstance = null;
let ec2ChartInstance = null;
let s3ChartInstance = null;
let iamChartInstance = null;

// --- Main Event Listener ---
document.addEventListener('DOMContentLoaded', () => {
    // Set default styling for all charts
    Chart.defaults.color = '#d1d5db';
    Chart.defaults.borderColor = '#374151';

    // Load all dashboard widgets
    loadCostWidget();
    loadEc2Widget();
    loadS3Widget();
    loadIamWidget();
    setupModal();
});


// --- Widget Loading Functions ---

function loadCostWidget() {
    const ctx = document.getElementById('costChart').getContext('2d');
    
    const updateChart = (granularity) => {
        fetchAPI(`cost-data?granularity=${granularity}`, (data) => {
            const chartData = {
                labels: data.labels,
                datasets: data.datasets
            };
            const pointColors = data.anomalies.map(isAnomaly => isAnomaly ? 'rgba(239, 68, 68, 1)' : 'rgba(14, 165, 233, 1)');
            chartData.datasets[0].pointBackgroundColor = pointColors;
            chartData.datasets[0].pointRadius = 5;
            chartData.datasets[0].borderColor = '#0ea5e9';
            
            if (costChartInstance) {
                costChartInstance.data = chartData;
                costChartInstance.update();
            } else {
                costChartInstance = new Chart(ctx, { type: 'line', data: chartData });
            }
        });
    };

    document.querySelectorAll('.filter-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            document.querySelector('.filter-btn.active').classList.remove('active');
            e.target.classList.add('active');
            updateChart(e.target.dataset.granularity);
        });
    });
    updateChart('DAILY');
}

function loadEc2Widget() {
    fetchAPI('ec2-summary', (data) => {
        animateValue('ec2-total', 0, data.total, 1200);
        animateValue('ec2-running', 0, data.running, 1200);
        animateValue('ec2-stopped', 0, data.stopped, 1200);
        
        // --- Create Donut Chart ---
        const donutCtx = document.getElementById('ec2StateChart').getContext('2d');
        const donutData = {
            labels: ['Running', 'Stopped'],
            datasets: [{
                data: [data.running, data.stopped],
                backgroundColor: ['#22c55e', '#64748b'], // Green, Gray
                borderColor: '#1f2937',
                borderWidth: 4,
            }]
        };
        if(ec2ChartInstance) ec2ChartInstance.destroy();
        ec2ChartInstance = new Chart(donutCtx, createDoughnutConfig(donutData));
        
        // --- Setup "View All" button to open the modal ---
        document.getElementById('ec2-view-all').addEventListener('click', () => {
            const tableHeader = `<thead><tr><th>Name</th><th>ID</th><th>Type</th><th>CPU (24h Avg)</th><th>Actions</th></tr></thead>`;
            const tableBody = data.instances.map(inst => `
                <tr>
                    <td><span class="status ${inst.State === 'running' ? 'status-green' : 'status-gray'}"></span>${inst.Name}</td>
                    <td>${inst.InstanceId}</td>
                    <td>${inst.InstanceType}</td>
                    <td>${inst.State === 'running' ? inst.CPU_Avg_24h + '%' : 'N/A'}</td>
                    <td>
                        <button class="action-btn start" onclick="handleEc2Action(event)" data-action="start" data-id="${inst.InstanceId}" ${inst.State === 'running' ? 'disabled' : ''}>Start</button>
                        <button class="action-btn stop" onclick="handleEc2Action(event)" data-action="stop" data-id="${inst.InstanceId}" ${inst.State !== 'running' ? 'disabled' : ''}>Stop</button>
                    </td>
                </tr>
            `).join('');
            const fullTable = `<div class="table-container"><table>${tableHeader}<tbody>${tableBody}</tbody></table></div>`;
            openModal('All EC2 Instances', fullTable);
        });
    });
}

function loadS3Widget() {
    fetchAPI('s3-summary', (data) => {
        animateValue('s3-total', 0, data.total, 1200);
        animateValue('s3-private', 0, data.private, 1200);
        animateValue('s3-public', 0, data.public, 1200);
        
        const donutCtx = document.getElementById('s3SecurityChart').getContext('2d');
        const donutData = {
            labels: ['Private', 'Potentially Public'],
            datasets: [{
                data: [data.private, data.public],
                backgroundColor: ['#22c55e', '#ef4444'], // Green, Red
                borderColor: '#1f2937',
                borderWidth: 4,
            }]
        };
        if(s3ChartInstance) s3ChartInstance.destroy();
        s3ChartInstance = new Chart(donutCtx, createDoughnutConfig(donutData));

        document.getElementById('s3-view-all').addEventListener('click', () => {
             const tableHeader = `<thead><tr><th>Bucket Name</th><th>Size</th></tr></thead>`;
             const tableBody = data.buckets.map(b => `
                <tr>
                    <td><span class="status ${b.IsPublic ? 'status-red' : 'status-green'}"></span>${b.Name}</td>
                    <td>${formatBytes(b.SizeBytes)}</td>
                </tr>
             `).join('');
             const fullTable = `<div class="table-container"><table>${tableHeader}<tbody>${tableBody}</tbody></table></div>`;
             openModal('S3 Bucket Security Details', fullTable);
        });
    });
}

function loadIamWidget() {
    fetchAPI('iam-summary', (data) => {
        animateValue('iam-total', 0, data.total, 1200);
        animateValue('iam-mfa', 0, data.mfa_enabled, 1200);
        animateValue('iam-no-mfa', 0, data.no_mfa, 1200);

        const donutCtx = document.getElementById('iamMfaChart').getContext('2d');
        const donutData = {
            labels: ['MFA Enabled', 'No MFA'],
            datasets: [{
                data: [data.mfa_enabled, data.no_mfa],
                backgroundColor: ['#0ea5e9', '#ef4444'], // Blue, Red
                borderColor: '#1f2937',
                borderWidth: 4,
            }]
        };
        if(iamChartInstance) iamChartInstance.destroy();
        iamChartInstance = new Chart(donutCtx, createDoughnutConfig(donutData));

        document.getElementById('iam-view-all').addEventListener('click', () => {
            const tableHeader = `<thead><tr><th>User Name</th><th>MFA Status</th><th>Access Key Use</th></tr></thead>`;
            const tableBody = data.users.map(u => `
                <tr>
                    <td>${u.UserName}</td>
                    <td><span class="status ${u.MfaEnabled ? 'status-green' : 'status-red'}"></span>${u.MfaEnabled ? 'Enabled' : 'Disabled'}</td>
                    <td>${u.KeyStatus}</td>
                </tr>
            `).join('');
            const fullTable = `<div class="table-container"><table>${tableHeader}<tbody>${tableBody}</tbody></table></div>`;
            openModal('IAM User Details', fullTable);
        });
    });
}

// --- Utility and Action Functions ---

async function handleEc2Action(event) {
    const button = event.currentTarget;
    const action = button.dataset.action;
    const instanceId = button.dataset.id;
    if (!confirm(`Are you sure you want to ${action} instance ${instanceId}?`)) return;
    
    button.disabled = true;
    button.innerText = 'Working...';

    try {
        const response = await fetch('http://127.0.0.1:5000/api/ec2-action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, instance_id: instanceId })
        });
        const result = await response.json();
        if (result.success) {
            alert(result.message);
        } else {
            alert(`Error: ${result.error}`);
        }
    } catch (error) {
        alert(`Failed to perform action: ${error}`);
    }
    
    // Refresh the widget to show the new state after a short delay
    setTimeout(() => {
        closeModal();
        loadEc2Widget();
    }, 3000);
}

function createDoughnutConfig(data) {
    return {
        type: 'doughnut',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: { legend: { display: false } }
        }
    };
}

const modal = document.getElementById('details-modal');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');

function setupModal() {
    const closeBtn = document.querySelector('.close-btn');
    closeBtn.onclick = () => closeModal();
    window.onclick = (event) => { if (event.target == modal) closeModal(); };
}

function openModal(title, content) {
    modalTitle.innerText = title;
    modalBody.innerHTML = content;
    modal.style.display = 'block';
}

function closeModal() {
    modal.style.display = 'none';
}

function fetchAPI(endpoint, callback) {
    fetch(`http://127.0.0.1:5000/api/${endpoint}`)
        .then(response => response.json())
        .then(data => callback(data))
        .catch(error => console.error(`Error loading ${endpoint}:`, error));
}

function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function animateValue(id, start, end, duration) {
    const obj = document.getElementById(id);
    if (!obj) {
        console.error(`DEBUG: Could not find element with ID: '${id}'`);
        return;
    }
    if (start === end) {
        obj.innerHTML = end;
        return;
    }
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = Math.floor(progress * (end - start) + start);
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            obj.innerHTML = end;
        }
    };
    window.requestAnimationFrame(step);
}