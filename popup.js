document.addEventListener('DOMContentLoaded', function() {
  // Tab switching
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.dataset.tab;
      
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(tab => tab.classList.remove('active'));
      
      button.classList.add('active');
      document.getElementById(tabName).classList.add('active');
      
      // Load data for the active tab
      if (tabName === 'today') {
        loadTodayData();
      } else if (tabName === 'stats') {
        loadStatsData();
      } else if (tabName === 'settings') {
        loadSettings();
      }
    });
  });
  
  // Initially load today's data
  loadTodayData();
  
  // Settings handlers
  document.getElementById('add-category').addEventListener('click', addNewCategory);
  document.getElementById('export-data').addEventListener('click', exportData);
  document.getElementById('clear-data').addEventListener('click', clearData);
});

// Format time function (converts ms to human-readable format)
function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

// Load today's data
function loadTodayData() {
  chrome.storage.local.get(['siteData', 'dailyData', 'categories'], function(result) {
    const siteData = result.siteData || {};
    const dailyData = result.dailyData || {};
    const categories = result.categories || {};
    const today = new Date().toISOString().slice(0, 10);
    
    // Combine current session data with today's aggregated data
    const todayData = dailyData[today] || { totalTime: 0, sites: {} };
    let totalTime = todayData.totalTime;
    let combinedSites = {...todayData.sites};
    
    // Add current session data
    for (const domain in siteData) {
      if (!combinedSites[domain]) {
        combinedSites[domain] = { totalTime: 0, visits: 0 };
      }
      combinedSites[domain].totalTime += siteData[domain].totalTime;
      combinedSites[domain].visits += siteData[domain].visits;
      totalTime += siteData[domain].totalTime;
    }
    
    // Update total time display
    document.getElementById('total-time-value').textContent = formatTime(totalTime);
    
    // Sort sites by time spent
    const sortedSites = Object.entries(combinedSites)
      .sort((a, b) => b[1].totalTime - a[1].totalTime)
      .slice(0, 5); // Top 5 sites
    
    // Display top sites
    const topSitesElement = document.getElementById('top-sites');
    topSitesElement.innerHTML = '';
    
    if (sortedSites.length === 0) {
      topSitesElement.innerHTML = '<p>No activity recorded yet.</p>';
    } else {
      sortedSites.forEach(([domain, data]) => {
        const siteItem = document.createElement('div');
        siteItem.className = 'site-item';
        
        siteItem.innerHTML = `
          <span class="site-name">${domain}</span>
          <span class="site-time">${formatTime(data.totalTime)}</span>
        `;
        
        topSitesElement.appendChild(siteItem);
      });
    }
    
    // Create category chart
    createCategoryChart(combinedSites, categories);
  });
}

// Create chart showing time by category
function createCategoryChart(sites, categories) {
  const ctx = document.getElementById('categoryChart').getContext('2d');
  const categoryData = {};
  let uncategorized = 0;
  
  // Calculate time per category
  for (const domain in sites) {
    let categorized = false;
    
    for (const category in categories) {
      if (categories[category].some(site => domain.includes(site))) {
        if (!categoryData[category]) {
          categoryData[category] = 0;
        }
        categoryData[category] += sites[domain].totalTime;
        categorized = true;
        break;
      }
    }
    
    if (!categorized) {
      uncategorized += sites[domain].totalTime;
    }
  }
  
  if (uncategorized > 0) {
    categoryData['Uncategorized'] = uncategorized;
  }
  
  // If no chart data, don't attempt to render
  if (Object.keys(categoryData).length === 0) {
    const container = document.querySelector('.chart-container');
    container.innerHTML = '<p>No data to display yet.</p>';
    return;
  }
  
  // Create the chart
  new Chart(ctx, {
    type: 'pie',
    data: {
      labels: Object.keys(categoryData),
      datasets: [{
        data: Object.values(categoryData),
        backgroundColor: [
          '#4285F4', '#EA4335', '#FBBC05', '#34A853', 
          '#FF6D01', '#46BDC6', '#7E57C2', '#EC407A'
        ]
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      legend: {
        position: 'bottom',
        labels: {
          boxWidth: 12,
          padding: 8
        }
      }
    }
  });
}

// Load weekly statistics
function loadStatsData() {
  chrome.storage.local.get(['dailyData', 'categories'], function(result) {
    const dailyData = result.dailyData || {};
    const categories = result.categories || {};
    
    // Create weekly chart
    createWeeklyChart(dailyData);
    
    // Calculate productivity score
    calculateProductivityScore(dailyData, categories);
  });
}

// Create weekly chart
function createWeeklyChart(dailyData) {
  const ctx = document.getElementById('weeklyChart').getContext('2d');
  
  // Get last 7 days
  const dates = [];
  const times = [];
  
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateString = date.toISOString().slice(0, 10);
    
    dates.push(dateString.slice(5)); // MM-DD format
    times.push((dailyData[dateString]?.totalTime || 0) / (1000 * 60 * 60)); // Convert to hours
  }
  
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: dates,
      datasets: [{
        label: 'Hours',
        data: times,
        backgroundColor: '#4285F4'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Hours'
          }
        }
      }
    }
  });
}

// Calculate productivity score based on work vs. entertainment categories
function calculateProductivityScore(dailyData, categories) {
  const today = new Date().toISOString().slice(0, 10);
  const todayData = dailyData[today] || { sites: {} };
  
  let productiveTime = 0;
  let totalTrackedTime = 0;
  
  // Consider work category as productive
  const workSites = categories['work'] || [];
  
  for (const domain in todayData.sites) {
    totalTrackedTime += todayData.sites[domain].totalTime;
    
    if (workSites.some(site => domain.includes(site))) {
      productiveTime += todayData.sites[domain].totalTime;
    }
  }
  
  let score = 0;
  if (totalTrackedTime > 0) {
    score = Math.round((productiveTime / totalTrackedTime) * 100);
  }
  
  // Update progress bar
  document.getElementById('productivity-bar').style.width = `${score}%`;
  document.getElementById('productivity-score').textContent = `${score}%`;
}

// Load settings
function loadSettings() {
  chrome.storage.local.get(['categories'], function(result) {
    const categories = result.categories || {};
    const categorySettings = document.getElementById('category-settings');
    
    categorySettings.innerHTML = '';
    
    for (const category in categories) {
      const categoryItem = document.createElement('div');
      categoryItem.className = 'category-item';
      
      let siteTagsHTML = '';
      categories[category].forEach(site => {
        siteTagsHTML += `<span class="site-tag">${site}</span>`;
      });
      
      categoryItem.innerHTML = `
        <h4>${category}</h4>
        <div class="site-tags">
          ${siteTagsHTML}
        </div>
        <button class="edit-category" data-category="${category}">Edit</button>
      `;
      
      categorySettings.appendChild(categoryItem);
      
      // Add event listener to edit button
      categoryItem.querySelector('.edit-category').addEventListener('click', function() {
        editCategory(category, categories[category]);
      });
    }
  });
}

// Add new category
function addNewCategory() {
  const categoryName = prompt('Enter category name:');
  
  if (categoryName) {
    const sitesInput = prompt('Enter websites for this category (comma separated):');
    
    if (sitesInput) {
      const sites = sitesInput.split(',')
        .map(site => site.trim())
        .filter(site => site);
      
      chrome.storage.local.get(['categories'], function(result) {
        const categories = result.categories || {};
        categories[categoryName] = sites;
        
        chrome.storage.local.set({ categories: categories }, function() {
          loadSettings();
        });
      });
    }
  }
}

// Edit existing category
function editCategory(category, sites) {
  const sitesInput = prompt(`Edit websites for "${category}" (comma separated):`, sites.join(', '));
  
  if (sitesInput !== null) {
    const newSites = sitesInput.split(',')
      .map(site => site.trim())
      .filter(site => site);
    
    chrome.storage.local.get(['categories'], function(result) {
      const categories = result.categories || {};
      categories[category] = newSites;
      
      chrome.storage.local.set({ categories: categories }, function() {
        loadSettings();
      });
    });
  }
}

// Export all data as JSON
function exportData() {
  chrome.storage.local.get(null, function(data) {
    const jsonData = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonData], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'productivity-data.json';
    a.click();
    
    URL.revokeObjectURL(url);
  });
}

// Clear all stored data
function clearData() {
  if (confirm('Are you sure you want to reset all data? This cannot be undone.')) {
    chrome.storage.local.clear(function() {
      alert('All data has been cleared.');
      loadTodayData(); // Reload with empty data
    });
  }
} 
