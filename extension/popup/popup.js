document.getElementById("btn-open").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("recording/recording.html") });
  window.close();
});
