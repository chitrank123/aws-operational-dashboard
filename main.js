let costChartInstance = null;

// Chart instances for the new donut charts
let ec2ChartInstance = null;
let s3ChartInstance = null;
let iamChartInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    // Set default styling for all charts
    Chart.defaults.color = '#e2e8f0';
    Chart.defaults.borderColor = '#334155';
    Chart.defaults.font.family = 'Inter';

    // --- Load All Widgets ---
    loadCostWidget();
    loadEc2Widget();
    loadS3Widget();
    loadIamWidget();

    // --- Setup Modal ---
    setupModal();
});

// --- Widget Loading Functions ---

// No changes to loadCostWidget
function loadCostWidget() {
    const ctx = document.getElementById('costChart').getContext('2d');
    
    const updateChart = (granularity) => {
        fetchAPI(`cost-data?granularity=${granularity}`, (data) => {
            const gradient = ctx.createLinearGradient(0, 0, 0, 300);
            gradient.addColorStop(0, 'rgba(56, 189, 248, 0.4)');
            gradient.addColorStop(1, 'rgba(56, 189, 248, 0)');

            data.datasets[0].backgroundColor = gradient;
            data.datasets[0].borderColor = 'rgba(56, 189, 248, 1)';
            data.datasets[0].borderWidth = 2;
            data.datasets[0].fill = true;
            data.datasets[0].tension = 0.4;

            const pointColors = data.anomalies.map(isAnomaly => 
                isAnomaly ? 'rgba(248, 113, 113, 1)' : 'rgba(56, 189, 248, 1)'
            );
            data.datasets[0].pointBackgroundColor = pointColors;
            data.datasets[0].pointBorderColor = pointColors;
            data.datasets[0].pointRadius = 5;
            data.datasets[0].pointHoverRadius = 7;
            
            if (costChartInstance) {
                costChartInstance.data = data;
                costChartInstance.update();
            } else {
                costChartInstance = new Chart(ctx, { type: 'line', data: data });
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
        // Animate KPIs
        animateValue('ec2-total', 0, data.total, 1500);
        animateValue('ec2-running', 0, data.running, 1500);
        animateValue('ec2-stopped', 0, data.stopped, 1500);
        
        // --- NEW: Create Donut Chart ---
        const ctx = document.getElementById('ec2StateChart').getContext('2d');
        const chartData = {
            labels: ['Running', 'Stopped'],
            datasets: [{
                data: [data.running, data.stopped],
                backgroundColor: ['#4ade80', '#94a3b8'], // Green, Gray
                borderColor: '#1e293b', // Match widget background
                borderWidth: 4,
            }]
        };

        if(ec2ChartInstance) ec2ChartInstance.destroy(); // Clear old chart before drawing new
        ec2ChartInstance = new Chart(ctx, createDoughnutConfig(chartData));
        
        // --- Setup "View All" button (Logic is the same, just no preview table) ---
        document.getElementById('ec2-view-all').addEventListener('click', () => {
            const tableHeader = `<thead><tr><th>Name</th><th>ID</th><th>Type</th><th>CPU (24h Avg)</th></tr></thead>`;
            const tableBody = data.instances.map(inst => `
                <tr>
                    <td><span class="status ${inst.State === 'running' ? 'status-green' : 'status-gray'}"></span>${inst.Name}</td>
                    <td>${inst.InstanceId}</td>
                    <td>${inst.InstanceType}</td>
                    <td>${inst.State === 'running' ? inst.CPU_Avg_24h + '%' : 'N/A'}</td>
                </tr>
            `).join('');
            const fullTable = `<div class="table-container"><table>${tableHeader}<tbody>${tableBody}</tbody></table></div>`;
            openModal('All EC2 Instances', fullTable);
        });
    });
}

function loadS3Widget() {
    fetchAPI('s3-summary', (data) => {
        animateValue('s3-total', 0, data.total, 1500);
        animateValue('s3-private', 0, data.private, 1500);
        animateValue('s3-public', 0, data.public, 1500);
        
        // --- NEW: Create Donut Chart ---
        const ctx = document.getElementById('s3SecurityChart').getContext('2d');
        const chartData = {
            labels: ['Private', 'Potentially Public'],
            datasets: [{
                data: [data.private, data.public],
                backgroundColor: ['#4ade80', '#f87171'], // Green, Red
                borderColor: '#1e293b',
                borderWidth: 4,
            }]
        };

        if(s3ChartInstance) s3ChartInstance.destroy();
        s3ChartInstance = new Chart(ctx, createDoughnutConfig(chartData));

        // --- Setup "View All" button ---
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
        animateValue('iam-total', 0, data.total, 1500);
        animateValue('iam-mfa', 0, data.mfa_enabled, 1500);
        animateValue('iam-no-mfa', 0, data.no_mfa, 1500);

        // --- NEW: Create Donut Chart ---
        const ctx = document.getElementById('iamMfaChart').getContext('2d');
        const chartData = {
            labels: ['MFA Enabled', 'No MFA'],
            datasets: [{
                data: [data.mfa_enabled, data.no_mfa],
                backgroundColor: ['#38bdf8', '#f87171'], // Blue, Red
                borderColor: '#1e293b',
                borderWidth: 4,
            }]
        };

        if(iamChartInstance) iamChartInstance.destroy();
        iamChartInstance = new Chart(ctx, createDoughnutConfig(chartData));

        // --- Setup "View All" button ---
        // You might need to add an id="iam-view-all" to your IAM widget's button in the HTML
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

// --- Modal and Utility Functions (No changes below this line) ---

function createDoughnutConfig(data) {
    return {
        type: 'doughnut',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: '#334155',
                    titleFont: { size: 14, weight: 'bold' },
                    bodyFont: { size: 12 },
                    padding: 10,
                    cornerRadius: 4,
                }
            }
        }
    };
}

const modal = document.getElementById('details-modal');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');

function setupModal() {
    const closeBtn = document.querySelector('.close-btn');
    closeBtn.onclick = () => closeModal();
    window.onclick = (event) => {
        if (event.target == modal) {
            closeModal();
        }
    };
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
        .then(data => {
            callback(data);
        })
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
    if (!obj || start === end) {
        obj.innerHTML = end; // Set final value immediately if no animation needed
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
            obj.innerHTML = end; // Ensure it ends on the exact value
        }
    };
    window.requestAnimationFrame(step);
}