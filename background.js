// Store active tab info
let activeTabInfo = {
  id: null,
  url: "",
  domain: "",
  startTime: 0
};

// Get domain from URL
function extractDomain(url) {
  if (!url) return "";
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (e) {
    return "";
  }
}

// Update site data when tab changes or URL changes
function updateCurrentSite(tabId, url) {
  // If we have an active tab, save its data first
  if (activeTabInfo.startTime > 0) {
    const now = Date.now();
    const timeSpent = now - activeTabInfo.startTime;
    
    // Only log if more than 1 second was spent
    if (timeSpent > 1000 && activeTabInfo.domain) {
      chrome.storage.local.get(['siteData'], function(result) {
        const siteData = result.siteData || {};
        const domain = activeTabInfo.domain;
        
        // Update or create entry
        if (!siteData[domain]) {
          siteData[domain] = {
            totalTime: 0,
            visits: 0,
            lastVisit: now
          };
        }
        
        siteData[domain].totalTime += timeSpent;
        siteData[domain].visits += 1;
        siteData[domain].lastVisit = now;
        
        chrome.storage.local.set({ siteData: siteData });
      });
    }
  }
  
  // Set new active tab info
  activeTabInfo = {
    id: tabId,
    url: url,
    domain: extractDomain(url),
    startTime: Date.now()
  };
}

// Reset tracking when browser is idle or locked
function resetTracking() {
  if (activeTabInfo.startTime > 0) {
    updateCurrentSite(null, "");
  }
  activeTabInfo = {
    id: null,
    url: "",
    domain: "",
    startTime: 0
  };
}

// Listen for tab activation changes
chrome.tabs.onActivated.addListener(function(activeInfo) {
  chrome.tabs.get(activeInfo.tabId, function(tab) {
    if (tab && tab.url && tab.url.startsWith("http")) {
      updateCurrentSite(tab.id, tab.url);
    } else {
      resetTracking();
    }
  });
});

// Listen for tab URL changes
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  if (changeInfo.status === "complete" && tab.active && tab.url && tab.url.startsWith("http")) {
    updateCurrentSite(tabId, tab.url);
  }
});

// Save data when window is closed
chrome.windows.onRemoved.addListener(function() {
  if (activeTabInfo.startTime > 0) {
    updateCurrentSite(null, "");
  }
});

// Set up daily data aggregation
chrome.alarms.create("dailyAggregation", {
  periodInMinutes: 1440 // 24 hours
});

chrome.alarms.onAlarm.addListener(function(alarm) {
  if (alarm.name === "dailyAggregation") {
    aggregateDailyData();
  }
});

function aggregateDailyData() {
  const today = new Date().toISOString().slice(0, 10);
  
  chrome.storage.local.get(['siteData', 'dailyData'], function(result) {
    const siteData = result.siteData || {};
    let dailyData = result.dailyData || {};
    
    if (!dailyData[today]) {
      dailyData[today] = { totalTime: 0, sites: {} };
    }
    
    // Aggregate today's data
    for (const domain in siteData) {
      if (!dailyData[today].sites[domain]) {
        dailyData[today].sites[domain] = {
          totalTime: 0,
          visits: 0
        };
      }
      
      dailyData[today].sites[domain].totalTime += siteData[domain].totalTime;
      dailyData[today].sites[domain].visits += siteData[domain].visits;
      dailyData[today].totalTime += siteData[domain].totalTime;
    }
    
    // Reset current tracking data and save aggregated data
    chrome.storage.local.set({
      siteData: {},
      dailyData: dailyData
    });
  });
}

// Initialize storage on install
chrome.runtime.onInstalled.addListener(function(details) {
  if (details.reason === "install") {
    chrome.storage.local.set({
      siteData: {},
      dailyData: {},
      categories: {
        "social": ["facebook.com", "twitter.com", "instagram.com"],
        "work": ["github.com", "docs.google.com", "slack.com"],
        "entertainment": ["youtube.com", "netflix.com", "twitch.tv"]
      }
    });
  }
}); 
