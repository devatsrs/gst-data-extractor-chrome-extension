"use strict";

var port;
var currentUrl;
var responseHandlers = {};
var msgId = 1;
//var console_ = chrome.extension.getBackgroundPage().console;
var session = {
  hostname: null,
  gstRegType: "?",
  businessName: "",
  gstin: "",
  dropdown: null,
  periods: [],
  return: null,
  finYear: "2017-18",
};

document.addEventListener(
  "DOMContentLoaded",
  function () {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      currentUrl = new URL(tabs[0].url);
      chrome.tabs.executeScript(tabs[0].id, { file: "jszip.min.js" });
      chrome.tabs.executeScript(tabs[0].id, { file: "contentscript.js" });
    });

    setTimeout(startupAsync, 500);
  },
  false
);

function connect() {
  return new Promise(function (resolve, reject) {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      port = chrome.tabs.connect(tabs[0].id, { name: "gst-data-extractor" });
      port.onMessage.addListener(function (msg) {
        responseHandlers[msg.Id](msg);
      });

      resolve();
    });
  });
}

async function processAsync(msg) {
  return new Promise(function (resolve, reject) {
    var i = msgId++;
    responseHandlers[i] = resolve;

    msg.Id = i;
    port.postMessage(msg);
  });
}

function displayRegType(regType) {
  if (regType == "NT" || regType == "TP") return "Regular";
  else if (regType == "CA") return "Casual";
  else if (regType == "CO") return "Composition";

  return regType;
}

function displayFilingStatus(filingStatus) {
  if (filingStatus == "FIL") return "Filed";

  if (filingStatus == "NF") return "Not filed";

  if (filingStatus == "FRZ") return "Submitted, but not filed";

  return filingStatus;
}

function displayGenTime(d, t) {
  //"date":"29/05/2019","time":"11:59:54"
  const gt = moment(`${d} ${t}`, "DD/MM/YYYY HH:mm:ss");
  return `<a data-toggle="tooltip" title="Generated on ${d} ${t}">Generated ${gt.fromNow()}</a>`;
}

function showStatus(msg) {
  const divStatus = getElement("status");
  const divStatusText = getElement("statusText");

  if (!msg) {
    divStatus.hidden = true;
    divStatusText.innerHTML = "";
  } else {
    divStatus.hidden = false;
    divStatusText.innerHTML = msg;
  }
}

function getElement(id) {
  return document.getElementById(id);
}

const gstn = {
  ustatus: function (hostname) {
    if (hostname == "gstr2b.gst.gov.in")
      return "https://gstr2b.gst.gov.in/services/api/ustatus?adhrflag=N";

    return `https://${hostname}/services/api/ustatus`;
  },
  busplaces: function (hostname) {
    return `https://${hostname}/publicservices/auth/api/search/tp/busplaces`;
  },

  dropdown: (hostname) => `https://${hostname}/returns/auth/api/dropdown`,

  rolestatus: function (hostname, period) {
    let url = new URL(`https://${hostname}/returns/auth/api/rolestatus`);
    url.searchParams.set("rtn_prd", period.value);

    if (period.rt) url.searchParams.set("userType", period.rt);

    return url.toString();
  },

  generateFile: function (hostname, returnConfig, period, forceGenerate) {
    let url = new URL(
      `https://${hostname}/returns/auth/api/offline/download/generate`
    );

    url.searchParams.set("rtn_typ", returnConfig.apiCode);
    url.searchParams.set("rtn_prd", period.value);
    url.searchParams.set("flag", forceGenerate ? "1" : "0");

    if (returnConfig.fileType)
      url.searchParams.set("file_type", returnConfig.fileType);

    return url.toString();
  },

  downloadFile: function (hostname, returnConfig, period, fileNo) {
    let url = new URL(
      `https://${hostname}/returns/auth/api/offline/download/url`
    );

    url.searchParams.set("rtn_typ", returnConfig.apiCode);
    url.searchParams.set("rtn_prd", period.value);
    url.searchParams.set("file_num", fileNo);

    if (returnConfig.fileType)
      url.searchParams.set("file_type", returnConfig.fileType);

    return url.toString();
  },

  gstr3bSummary: function (hostname, period) {
    let url = new URL(`https://${hostname}/returns/auth/api/gstr3b/summary`);
    url.searchParams.set("rtn_prd", period.value);
    return url.toString();
  },

  gstr3bPayable: function (hostname, period) {
    let url = new URL(`https://${hostname}/returns/auth/api/gstr3b/taxpayble`);
    url.searchParams.set("rtn_prd", period.value);
    return url.toString();
  },

  annualrolestatus: function (hostname, fy) {
    let url = new URL(`https://${hostname}/returns2/auth/api/annualrolestatus`);
    url.searchParams.set("return_prd", `03${fy + 1}`);
    return url.toString();
  },

  gstr2b: function (hostname, period, fileNo) {
    let url = new URL(`https://${hostname}/gstr2b/auth/api/gstr2b/getjson`);
    url.searchParams.set("rtnprd", period.value);

    if (fileNo) url.searchParams.set("fn", fileNo.toString());

    return url.toString();
  },

  gstr2bCheck: function (hostname, period) {
    let url = new URL(`https://${hostname}/gstr2b/auth/api/gstr2b/getdata`);
    url.searchParams.set("rtnprd", period.value);
    return url.toString();
  },
};

function log(text, obj) {
  processAsync({ request: "log", text: text, obj: obj });
}

function saveJsonFile(fileName, jsonData) {
  var blob = new Blob([jsonData], { type: "text/json" });
  var url = URL.createObjectURL(blob);
  chrome.downloads.download({
    url: url,
    filename: fileName,
  });
}

function saveZipFile(filename, zipData) {
  var blob = new Blob([zipData], { type: "application/zip" });
  var url = URL.createObjectURL(blob);
  chrome.downloads.download({
    url: url,
    filename: filename,
  });
}

function saveBlobUrl(fileName, url) {
  chrome.downloads.download({
    url: url,
    filename: fileName,
  });
}

function zip(fileData, fileName, callback) {
  var zip = new JSZip();
  zip.file(fileName, fileData);
  zip.generateAsync({ type: "blob" }).then(callback);
}

function saveJsonAsZipAsync(jsonfilename, zipfilename, jsonData) {
  return processAsync({
    request: "save-json-as-zip",
    jsonfilename: jsonfilename,
    zipfilename: zipfilename,
    jsonData: jsonData,
  });
}

function formatNumber(num, length) {
  var r = "" + num;
  while (r.length < length) {
    r = "0" + r;
  }
  return r;
}

function extractRegex(mainString, pattern) {
  var res = new RegExp(pattern).exec(mainString);

  if (!res) return res;

  return res[0];
}

function makeJsonFileName(gstReturnType, gstin, period) {
  var d = new Date();
  var dateStamp =
    formatNumber(d.getDate(), 2) +
    formatNumber(d.getMonth() + 1, 2) +
    d.getFullYear();
  return `returns_${dateStamp}_${gstReturnType}_${gstin}_${period}`;
}

function makeZipFileName(gstReturnType, gstin, period, tag) {
  var d = new Date();
  var dateStamp =
    d.getFullYear() +
    formatNumber(d.getMonth() + 1, 2) +
    formatNumber(d.getDate(), 2);
  var tagString = tag ? `_${tag}` : "";
  return `${gstin}_${gstReturnType}_${period}_${dateStamp}${tagString}`;
}

function getFileGenStatus(resp) {
  if (resp.status === undefined) {
    return "Invalid response received";
  } else if (resp.status != 1) {
    if (resp.error === undefined) return "Unknown error occurred";

    if (
      resp.error.errorCode == "RTN_24" ||
      resp.error.errorCode == "RTN_24_2A"
    ) {
      getElement("banner-generating").hidden = false;
      return "Generating file...";
    } else {
      return resp.error.message;
    }
  } else if (resp.data === undefined) {
    return "No response received";
  } else if (resp.data.status == 0) {
    return null; //file already generated
  } else if (resp.data.status == 1) {
    getElement("banner-generating").hidden = false;
    return "Generating file...";
  } else {
    return resp.data.msg;
  }
}

function getReturnInfo(info, gstReturnType) {
  var i;

  for (i = 0; i < info.data.user.length; i++) {
    var j;
    var u = info.data.user[i];

    for (j = 0; j < u.returns.length; j++) {
      if (u.returns[j].return_ty == gstReturnType) {
        return u.returns[j];
      }
    }
  }

  return { status: "Not available" };
}

async function startupAsync() {
  //console_.log("startupAsync...");
  //save the hostname for future use
  session.hostname = currentUrl.hostname.toLowerCase();

  showStatus("Connecting...");

  await connect();

  showStatus("Loading... ");

  const msg = await processAsync({
    request: "get",
    url: gstn.ustatus(session.hostname),
  });

  console.log(msg);

  if (!msg.status) {
    showStatus("Failed to get business information!");
    return;
  }

  const info = JSON.parse(msg.response);

  if (!info.regType) {
    showStatus("Please login to GST Portal first!");
    return;
  }

  // if (
  //   session.hostname != "return.gst.gov.in" &&
  //   session.hostname != "gstr2b.gst.gov.in"
  // ) {
  //   showStatus("Please open return dashboard first!");
  //   return;
  // }

  showStatus(null);
  session.businessName = info.bname;
  session.gstin = info.gstin;

  getElement("businessName").innerHTML = "Hi " + session.businessName;
  getElement("businessInfo").hidden = false;

  if (info.regType == "NT" || info.regType == "TP" || info.regType == "CA") {
    session.gstRegType = "";
  } else if (info.regType == "CO") {
    session.gstRegType = "CO";
  } else {
    showStatus(`Registration type ${info.regType} is not supported.`);
    return;
  }

  //updateReturns();
  await updatePeriods();
}

function addOption(selectorElement, optionText, optionValue) {
  var opt = document.createElement("option");
  opt.value = optionValue;
  opt.innerHTML = optionText;
  selectorElement.appendChild(opt);
}

function updateReturns() {
  const returnSelector = getElement("gstReturnType");

  if (!session.gstRegType) {
    //regular
    addOption(returnSelector, configR3B.display, configR3B.key);
    addOption(returnSelector, configR1.display, configR1.key);
    addOption(returnSelector, configR2A.display, configR2A.key);
    addOption(returnSelector, configR2AExcel.display, configR2AExcel.key);
    addOption(returnSelector, configR2B.display, configR2B.key);
    addOption(returnSelector, configR9.display, configR9.key);
    addOption(returnSelector, configR4.display, configR4.key);
    addOption(returnSelector, configR4A.display, configR4A.key);
  } else {
    //composition
    addOption(returnSelector, configR4.display, configR4.key);
    addOption(returnSelector, configR4A.display, configR4A.key);
    addOption(returnSelector, configR3B.display, configR3B.key);
    addOption(returnSelector, configR1.display, configR1.key);
    addOption(returnSelector, configR2A.display, configR2A.key);
    addOption(returnSelector, configR2B.display, configR2B.key);
    addOption(returnSelector, configR2AExcel.display, configR2AExcel.key);
    addOption(returnSelector, configR9.display, configR9.key);
  }
}

async function updatePeriods() {
  showStatus("Getting periods...");

  const msg = await processAsync({
    request: "get",
    url: gstn.dropdown(session.hostname),
  });

  if (!msg.status) {
    showStatus("Failed to get periods!");
    return;
  }

  const respObj = JSON.parse(msg.response);
  if (respObj.status != 1) {
    showStatus("Rejected");
    return;
  }

  showStatus(null);
  session.dropdown = respObj.data;
  session.dropdown.Years.sort((a, b) => -1 * a.year.localeCompare(b.year));

  const selectorFinYear = getElement("finYear");
  for (let i = 0; i < session.dropdown.Years.length; i++) {
    let opt = document.createElement("option");
    opt.value = session.dropdown.Years[i].year;
    opt.innerHTML = session.dropdown.Years[i].year;
    selectorFinYear.appendChild(opt);
  }

  const btnRefresh = getElement("refresh");
  btnRefresh.onclick = function (evt) {
    reportButtonClicked(evt);

    getElement("banner-generating").hidden = true;

    const selectorGstReturnType = getElement("gstReturnType");
    const selectorFinYear = getElement("finYear");

    session.return = returnConfig[selectorGstReturnType.value];
    session.finYear = selectorFinYear.value;

    updateWorkspace();
  };

  // const btnGstin = getElement("gstin_get");
  // btnGstin.onclick = function (evt) {
  //   getElement("banner-generating").hidden = true;

  //   showStatus("Loading... ");

  //   // const msg = await processAsync({
  //   //   request: "post",
  //   //   url: gstn.busplaces(session.hostname),
  //   // });

  //   console.log(msg);

  //   if (!msg.status) {
  //     showStatus("Failed to get business information!");
  //     return;
  //   }

  //   const info = JSON.parse(msg.response);

  //   if (!info.regType) {
  //     showStatus("Please login to GST Portal first!");
  //     return;
  //   }
  // };

  getElement("gst_workspace").hidden = false;
}

async function updateWorkspace() {
  if (session.hostname != session.return.hostname) {
    const divStatus = getElement("returnStatus");
    divStatus.innerHTML =
      session.return.key == configR2B.key
        ? `<div class="row alert alert-warning" role="alert">Please open GSTR-2B of any period to download GSTR-2B JSON files.</div>`
        : `<div class="row alert alert-warning" role="alert">Please open Return Dashboard to download ${session.return.display}.</div>`;
    return;
  }

  //GSTR-9 is a different beast
  if (session.return.key == configR9.key) {
    await updateWorkspaceForGstr9();
    return;
  }

  const divStatus = getElement("returnStatus");
  divStatus.innerHTML = `Getting ${session.return.display} status...`;

  let rowsHtml = "";

  session.periods.length = 0;

  for (let i = 0; i < session.dropdown.Years.length; i++) {
    if (session.dropdown.Years[i].year != session.finYear) {
      continue;
    }

    for (var j = 0; j < session.dropdown.Years[i].months.length; j++) {
      let p = session.dropdown.Years[i].months[j];
      p.isValid = false;

      session.periods.push(p);

      let rowActions = session.return.needsFileGeneration
        ? `<div class="btn-group btn-group-sm" role="group">
          <button type="button" class="btn btn-success" id="btn-download-${p.value}" data-fp="${p.value}" hidden>Download</button>
          <button type="button" class="btn btn-warning" id="btn-gen-${p.value}" data-fp="${p.value}" hidden>Generate</button>
        </div>`
        : `<button type="button" class="btn btn-success btn-sm" id="btn-download-${p.value}" data-fp="${p.value}" hidden>Download</button>`;

      let row = `<tr>
          <td class="align-middle">${p.month}</td>
          <td class="align-middle"><div id="info-${p.value}">...</div></td>
          <td class="align-middle">${rowActions}</td>
        </tr>`;

      rowsHtml += row;
    }
  }

  let workspaceActions = session.return.needsFileGeneration
    ? `<div class="btn-group btn-group-sm float-right mr-2" role="group">
      <button type="button" class="btn btn-success" id="btn-download-all" hidden><strong>Download All</strong></button>
      <button type="button" class="btn btn-warning" id="btn-gen-all" hidden><strong>Generate All</strong></button>
    </div>`
    : `<div class="btn-group btn-group-sm float-right mr-2" role="group">
      <button type="button" class="btn btn-success" id="btn-download-all" hidden><strong>Download All</strong></button>
    </div>`;

  divStatus.innerHTML = `<div class="row">
      <table class="table table-bordered table-sm">
        <tr>
          <th>Period</th>
          <th>Status</th>
          <th>Action</th>
        </tr>
        ${rowsHtml}
      </table>
    </div>
    <div class="row" id="all" hidden>
      <div class="col px-0">${workspaceActions}</div>
    </div>`;

  let validPeriodCount = 0;

  if (session.return.key == configR2B.key) {
    //Check in series
    for (let i = 0; i < session.periods.length; i++) {
      await updateRow2B(session.periods[i]);
    }
  } else {
    //Check in parallel
    await Promise.all(session.periods.map((p) => updateRow(p)));
  }

  for (let i = 0; i < session.periods.length; i++) {
    if (session.periods[i].isValid) validPeriodCount++;
  }

  if (validPeriodCount > 1) {
    getElement("all").hidden = false;

    const btnDownloadAll = getElement("btn-download-all");
    btnDownloadAll.hidden = false;
    btnDownloadAll.onclick = function (evt) {
      reportButtonClicked(evt);
      downloadAll();
    };

    const btnGenAll = getElement("btn-gen-all");

    if (btnGenAll) {
      btnGenAll.hidden = false;
      btnGenAll.onclick = function (evt) {
        reportButtonClicked(evt);
        generateAll();
      };
    }
  }
}

async function updateRow(period) {
  const divInfo = getElement(`info-${period.value}`);

  let month = parseInt(period.value.substring(0, 2));
  let year = parseInt(period.value.substring(2));

  if (session.return.isQuarterly) {
    let isMonth = month < 13;

    if (isMonth) {
      divInfo.innerHTML = "Not available";
      return;
    }
  }

  if (session.return.startDate && month < 13) {
    let periodDate = new Date(Date.UTC(year, month - 1, 1));
    if (periodDate < session.return.startDate) {
      divInfo.innerHTML = "Not available";
      return;
    }
  }

  const role = await processAsync({
    request: "get",
    url: gstn.rolestatus(session.hostname, period),
  });

  if (!role.status) {
    divInfo.innerHTML = "Failed!";
    return;
  }

  const info = JSON.parse(role.response);
  const filingStatus = getReturnInfo(info, session.return.apiCode).status;

  if (filingStatus != session.return.expFilingStatus) {
    divInfo.innerHTML = displayFilingStatus(filingStatus);
    return;
  }

  if (session.return.needsFileGeneration) {
    divInfo.innerHTML = "Checking files...";

    //Check whether the file is generated or not

    let msgFile = await processAsync({
      request: "get",
      url: gstn.generateFile(session.hostname, session.return, period, false),
    });

    if (!msgFile.status) {
      divInfo.innerHTML = "Failed!";
      return;
    }

    const resp = JSON.parse(msgFile.response);
    const fileGenStatus = getFileGenStatus(resp);

    if (fileGenStatus) {
      divInfo.innerHTML = fileGenStatus;
      return;
    }

    divInfo.innerHTML = displayGenTime(resp.data.date, resp.data.time);
    period.isValid = true;
    period.fileCount = resp.data.url.length;
  } else {
    divInfo.innerHTML = "Filed";
    period.isValid = true;
    period.fileCount = 1;
  }

  const btnDownload = getElement(`btn-download-${period.value}`);
  btnDownload.innerHTML =
    period.fileCount == 1 ? "Download" : `Download ${period.fileCount} files`;
  btnDownload.hidden = false;

  btnDownload.onclick = function (evt) {
    reportButtonClicked(evt);
    download(period);
  };

  if (session.return.needsFileGeneration) {
    const btnGenerate = getElement(`btn-gen-${period.value}`);
    btnGenerate.hidden = false;
    btnGenerate.onclick = function (evt) {
      reportButtonClicked(evt);
      generate(period);
    };
  }
}

async function updateRow2B(period) {
  const divInfo = getElement(`info-${period.value}`);

  let month = parseInt(period.value.substring(0, 2));
  let year = parseInt(period.value.substring(2));

  if (session.return.isQuarterly) {
    let isMonth = month < 13;

    if (isMonth) {
      divInfo.innerHTML = "Not available";
      return;
    }
  }

  if (session.return.startDate && month < 13) {
    let periodDate = new Date(Date.UTC(year, month - 1, 1));
    if (periodDate < session.return.startDate) {
      divInfo.innerHTML = "Not available";
      return;
    }
  }

  await sleep(500);

  const role = await processAsync({
    request: "get",
    url: gstn.gstr2bCheck(session.hostname, period),
  });

  if (!role.status) {
    divInfo.innerHTML = "Failed!";
    return;
  }

  const info = JSON.parse(role.response);

  if (info.error) {
    const errorMessage =
      info.error?.error_cd == "RET2B1016"
        ? "Not available"
        : info.error?.error_cd == "RET2B1018"
        ? "Not generated yet"
        : info.error?.message ?? "Failed";

    divInfo.innerHTML = errorMessage;
  } else {
    divInfo.innerHTML = "Generated";
    period.isValid = true;
    period.fileCount = 1;

    const btnDownload = getElement(`btn-download-${period.value}`);
    btnDownload.innerHTML =
      period.fileCount == 1 ? "Download" : `Download ${period.fileCount} files`;
    btnDownload.hidden = false;

    btnDownload.onclick = function (evt) {
      reportButtonClicked(evt);
      download(period);
    };
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function download(period) {
  const btnDownload = getElement(`btn-download-${period.value}`);
  btnDownload.disabled = true;

  //GSTR-3B needs special processing
  if (session.return.key == configR3B.key) {
    btnDownload.innerHTML = "Downloading";

    const msg3bSummary = await processAsync({
      request: "get",
      url: gstn.gstr3bSummary(session.hostname, period),
    });

    if (!msg3bSummary.status) {
      btnDownload.innerHTML = "Failed (Summary) - " + msg3bSummary.error;
      return;
    }

    const r3bSummary = JSON.parse(msg3bSummary.response);

    if (r3bSummary.status != 1) {
      btnElement.innerHTML = "Rejected (Summary)";
      return;
    }

    btnDownload.innerHTML = "Downloading";

    const msg3bPayable = await processAsync({
      request: "get",
      url: gstn.gstr3bPayable(session.hostname, period),
    });

    if (!msg3bPayable.status) {
      btnDownload.innerHTML = "Failed (Payments) - " + msg3bPayable.error;
      return;
    }

    const r3bPayable = JSON.parse(msg3bPayable.response);

    if (r3bPayable.status != 1) {
      btnDownload.innerHTML = "Rejected (Payments)";
      return;
    }

    r3bSummary.data.taxpayble = r3bPayable.data;

    const jsonData = JSON.stringify(r3bSummary.data);
    const jsonfileName = makeJsonFileName(
      "R3B",
      r3bSummary.data.gstin,
      period.value
    );
    const zipfileName = makeZipFileName(
      "R3B",
      r3bSummary.data.gstin,
      period.value
    );

    await saveJsonAsZipAsync(jsonfileName, zipfileName, jsonData);
    btnDownload.innerHTML = "Done";
  }
  //GSTR-2B needs special processing
  else if (session.return.key == configR2B.key) {
    btnDownload.innerHTML = "Downloading";

    const msg2b = await processAsync({
      request: "get",
      url: gstn.gstr2b(session.hostname, period),
    });

    if (!msg2b.status) {
      btnDownload.innerHTML = "Failed – " + msg2b.error;
      return;
    }

    const r2b = JSON.parse(msg2b.response);

    if (r2b?.status_cd === "0") {
      //failure
      btnDownload.innerHTML = "Failed – " + r2b.error.message;
      return;
    }

    const fileCount = r2b.data.fc;
    const jsonSummaryData = msg2b.response;
    const jsonSummaryFileName = makeZipFileName(
      "R2B",
      r2b.data.gstin,
      period.value,
      fileCount ? "Summary" : ""
    );
    saveJsonFile(jsonSummaryFileName + ".json", jsonSummaryData);

    if (fileCount) {
      // multiple files
      for (let fileNo = 1; fileNo <= fileCount; fileNo++) {
        btnDownload.innerHTML = `Downloading`;

        const msg2bFile = await processAsync({
          request: "get",
          url: gstn.gstr2b(session.hostname, period, fileNo),
        });

        if (!msg2bFile.status) {
          btnDownload.innerHTML = "Failed – " + msg2bFile.error;
          return;
        }

        const jsonData = msg2bFile.response;
        const jsonfileName = makeZipFileName(
          "R2B",
          r2b.data.gstin,
          period.value,
          `File${fileNo}`
        );
        saveJsonFile(jsonfileName + ".json", jsonData);
      }
    }

    btnDownload.innerHTML = fileCount
      ? `Done (${fileCount + 1} files)`
      : "Done";
  } else {
    //all other returns
    const msgFile = await processAsync({
      request: "get",
      url: gstn.generateFile(session.hostname, session.return, period, false),
    });

    if (!msgFile.status) {
      btnDownload.innerHTML = "Failed! Retry Download";
      btnDownload.disabled = false;
      return;
    }

    const resp = JSON.parse(msgFile.response);
    const fileGenStatus = getFileGenStatus(resp);

    if (fileGenStatus) {
      btnDownload.innerHTML = fileGenStatus;
      return;
    }

    for (let i = 0; i < resp.data.url.length; i++) {
      btnDownload.innerHTML = `Downloading (${i + 1}/${resp.data.url.length})`;

      const downloadfileName =
        makeZipFileName(
          session.return.fileNameCode,
          session.gstin,
          period.value,
          session.return.fileTypeCode
        ) + ".zip";
      const downloadSuccess = await chromeDownload(
        resp.data.url[i],
        downloadfileName
      );

      if (!downloadSuccess) {
        btnDownload.innerHTML = "Failed!";
        //We don't currently any other reason for failure
        //so we will automatically try to regenerate the file
        await generate(period, `File is missing! Generating again...`);
        return;
      }
    }

    btnDownload.innerHTML = "Done";
  }
}

async function generate(period, userMessage) {
  const btnDownload = getElement(`btn-download-${period.value}`);
  const divInfo = getElement(`info-${period.value}`);
  const btnGenerate = getElement(`btn-gen-${period.value}`);

  btnGenerate.innerHTML = "Requesting...";

  const msgGen = await processAsync({
    request: "get",
    url: gstn.generateFile(session.hostname, session.return, period, true),
  });

  if (!msgGen.status) {
    btnGenerate.innerHTML = "Failed!";
    return;
  }

  btnDownload.hidden = true;
  btnGenerate.hidden = true;
  divInfo.innerHTML = userMessage ? userMessage : "Generating file...";
  getElement("banner-generating").hidden = false;
}

async function downloadAll() {
  const btnDownloadAll = getElement("btn-download-all");
  btnDownloadAll.disabled = true;
  btnDownloadAll.innerHTML = "Downloading...";

  for (let i = 0; i < session.periods.length; i++) {
    if (!session.periods[i].isValid) continue;

    //Something wrong with 2B, sending requests too fast creates issue
    if (session.return.key == configR2B.key) {
      await sleep(200);
    }

    await download(session.periods[i]);
  }

  btnDownloadAll.innerHTML = "Done";
}

async function generateAll() {
  const btnDownloadAll = getElement("btn-download-all");
  btnDownloadAll.hidden = true;

  const btnGenAll = getElement("btn-gen-all");
  btnGenAll.disabled = true;
  btnGenAll.innerHTML = "Requesting...";

  for (let i = 0; i < session.periods.length; i++) {
    if (!session.periods[i].isValid) continue;

    await generate(session.periods[i]);
  }

  btnGenAll.innerHTML = "Done";
}

// GSTR-9

async function updateWorkspaceForGstr9() {
  const divStatus = getElement("returnStatus");

  var fy = parseInt(session.finYear.substring(0, 4));

  if (fy > 2019) {
    divStatus.innerHTML = `<div class="row alert alert-warning" role="alert">This financial year is not yet available.</div>`;
    return;
  }

  divStatus.innerHTML = `Getting ${session.return.display} status...`;

  let msg = await processAsync({
    request: "get",
    url: gstn.annualrolestatus(session.hostname, fy),
  });

  if (!msg.status) {
    divStatus.innerHTML = "Failed to get GSTR-9 status!";
    return;
  }

  var info = JSON.parse(msg.response);
  var filingStatus = getReturnInfo(info, "GSTR9").status;

  if (filingStatus != "NF") {
    divStatus.innerHTML = `<div class="row">
        <p>GSTR-9 is ${displayFilingStatus(filingStatus)}.</p>
      </div>`;
    return;
  }

  divStatus.innerHTML = `<div class="row">
      <table class="table table-bordered table-sm">
        <tr>
          <th>Description</th>
          <th>Action</th>
        </tr>
        <tr>
          <td class="align-left">System calculated summary (Json)</td>
          <td class="align-middle">
            <div class="btn-group btn-group-sm" role="group">
              <button type="button" class="btn btn-success" id="btn-dl-g9-sys-${fy}" data-fp="${fy}">Download</button>
            </div>
          </td>
        </tr>
      </table>
    </div>`;

  const btn = getElement(`btn-dl-g9-sys-${fy}`);
  btn.onclick = function (evt) {
    reportButtonClicked(evt);
    downloadG9Sys(fy);
  };
}

async function downloadG9Sys(fy) {
  const btn = getElement(`btn-dl-g9-sys-${fy}`);

  btn.innerHTML = "Downloading";
  btn.disabled = true;

  let msgCalcG9 = await processAsync({
    request: "get",
    url: `https://return.gst.gov.in/returns2/auth/api/gstr9/details/calc?gstin=${
      session.gstin
    }&ret_period=03${fy + 1}`,
  });

  if (!msgCalcG9.status) {
    btn.innerHTML = "Failed - " + msgCalcG9.error;
    return;
  }

  var sysG9 = JSON.parse(msgCalcG9.response);

  if (sysG9.status != 1) {
    btn.innerHTML = sysG9.error?.message ?? "Rejected";
    return;
  }

  sysG9.data.src = "gstn";
  var jsonData = JSON.stringify(sysG9.data);
  var jsonfileName = makeJsonFileName("R9", sysG9.data.gstin, `03${fy + 1}`);
  var zipfileName = makeZipFileName("R9", sysG9.data.gstin, `03${fy + 1}`);

  await saveJsonAsZipAsync(jsonfileName, zipfileName, jsonData);

  btn.innerHTML = "Done";
}

async function chromeDownload(url, filename) {
  const currentId = await startdownload(url, filename);

  if (!currentId) {
    log(`Couldn't start download of ${url}`);
    return false;
  }

  const success = await completeDownload(currentId);

  if (!success) {
    log(`Download-${currentId} failed for url - ${url}`);
    chrome.downloads.erase({ id: currentId });
  }
  return success;
}

function startdownload(url, filename) {
  return new Promise((resolve) =>
    chrome.downloads.download({ url, filename }, resolve)
  );
}

function completeDownload(itemId) {
  return new Promise((resolve) => {
    chrome.downloads.onChanged.addListener(function onChanged({ id, state }) {
      //log(`id:${id} current-state:${state.current}`);
      if (id === itemId && state && state.current !== "in_progress") {
        chrome.downloads.onChanged.removeListener(onChanged);
        resolve(state.current === "complete");
      }
    });
  });
}
