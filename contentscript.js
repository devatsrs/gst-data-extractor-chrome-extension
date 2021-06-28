"use strict";

var initDone;
var port;
var process;

if (!initDone) {
  init();
}

function init() {
  log("Initialising content script.");

  registerProcessors();

  chrome.runtime.onConnect.addListener(function (p) {
    port = p;

    log(`Port ${port.name} is now open.`);
    port.onDisconnect.addListener((x) =>
      log(`Port ${port.name} is now closed.`)
    );
    port.onMessage.addListener(function (msg) {
      var target = process[msg.request];

      if (target) {
        target(msg);
      } else {
        msg.status = false;
        msg.error = "Unknown request";
        log("Sending response: " + JSON.stringify(msg));
        port.postMessage(msg);
      }
    });
  });

  initDone = true;
}

/////// Helper functions ///////

async function httpGetAsync(url, responseType) {
  return new Promise(function (resolve, reject) {
    let xhr = new XMLHttpRequest();

    xhr.onreadystatechange = function () {
      if (this.readyState == 4) {
        var success = this.status == 200;
        log(
          `Request ${url} ${
            success ? "completed" : "failed"
          } with status code ${this.status}`
        );

        resolve({
          success: success,
          statusCode: this.status,
          responseUrl: success ? this.responseURL : null,
          responseData: success ? this.response : null,
        });

        //We never reject our promise
      }
    };

    xhr.open("GET", url, true);
    xhr.responseType = responseType;
    xhr.timeout = 30000;
    xhr.send();
  });
}

async function httpPostAsync(url, responseType, data) {
  return new Promise(function (resolve, reject) {
    let xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function () {
      if (this.readyState == 4) {
        var success = this.status == 200;
        log(
          `Request ${url} ${
            success ? "completed" : "failed"
          } with status code ${this.status}`
        );

        resolve({
          success: success,
          statusCode: this.status,
          responseUrl: success ? this.responseURL : null,
          responseData: success ? this.response : null,
        });

        //We never reject our promise
      }
    };

    xhr.open("POST", url, true);
    xhr.responseType = responseType;
    xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
    xhr.timeout = 30000;
    xhr.send(JSON.stringify(data));
  });
}

function log(msg, obj) {
  if (!obj) console.log(new Date().toISOString() + ": " + msg);
  else
    console.log(
      `${new Date().toISOString()}: ${msg} (${
        obj.constructor.name
      }) ${JSON.stringify(obj)}`
    );
}

async function zipAsync(fileData, fileName) {
  let zip = new JSZip();
  zip.file(fileName, fileData);
  return await zip.generateAsync({ type: "blob" });
}

function saveFile(filename, content, contentType) {
  var a = document.createElement("a");
  var blob = new Blob([content], { type: contentType });
  a.href = window.URL.createObjectURL(blob);
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click(); //this is probably the key - simulating a click on a download link
  a.parentNode.removeChild(a);
}

function clickUrl(url, onNewTab) {
  var a = document.createElement("a");
  a.href = url;
  a.style.display = "none";

  if (onNewTab) a.target = "_blank";

  document.body.appendChild(a);
  a.click(); //this is probably the key - simulating a click on a download link
  a.parentNode.removeChild(a);
}

/////// Process functions ///////

function registerProcessors() {
  process = {};
  process["get"] = processGet;
  process["getBlob"] = processGetBlob;
  process["log"] = processLog;
  process["save-json-as-zip"] = processZipAndSave;
}

async function processGet(msg) {
  let resp = await httpGetAsync(msg.url, "text");

  msg.status = resp.success;
  msg.statusCode = resp.statusCode;
  msg.response = resp.responseData;
  msg.responseUrl = resp.responseUrl;

  //log('Sending response: ' + JSON.stringify(msg));
  //log(`Response data length: ${data.length}`);
  //log(`Response data type: ${typeof data}`);

  port.postMessage(msg);
}

async function processGetBlob(msg) {
  let resp = await httpGetAsync(msg.url, "blob");

  msg.status = resp.success;
  msg.statusCode = resp.statusCode;
  msg.response = null;
  msg.responseUrl = resp.responseUrl;

  if (resp.responseData && resp.responseData.size > 0)
    msg.response = URL.createObjectURL(resp.responseData);

  //log('Sending response: ' + JSON.stringify(msg));
  //log(`Response data length: ${data.size}`);

  port.postMessage(msg);
}

function processLog(msg) {
  msg.status = true;
  msg.statusCode = 200;
  log(msg.text, msg.obj);
  port.postMessage(msg);
}

async function processZipAndSave(msg) {
  let zipData = await zipAsync(msg.jsonData, `${msg.jsonfilename}.json`);
  saveFile(msg.zipfilename + ".zip", zipData, "application/zip");
  msg.status = true;
  msg.statusCode = 200;
  port.postMessage(msg);
}
