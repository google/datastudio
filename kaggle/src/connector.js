var connector = {};
// Sample Kaggle dataset.
// Kaggle URL format: https://www.kaggle.com/{ownerSlug}/{datasetSlug}.
// Sample Kaggle URL: https://www.kaggle.com/unsdsn/world-happiness
// Filename refers to the dataset under the 'Data' tab.
connector.ownerSlug = 'unsdsn';
connector.datasetSlug = 'world-happiness';
connector.fileName = '2016.csv';
connector.usernameKey = 'USERNAME';
connector.tokenKey = 'KEY';
connector.kaggleUrl = 'https://www.kaggle.com';
connector.apiBaseUrl = connector.kaggleUrl + '/api/v1/';
connector.apiDownloadSlug = 'datasets/download-raw';
connector.pingUrl = connector.apiBaseUrl + 'competitions/list';
connector.fileSizeLimitInBytes = 20971520;

function getAuthType() {
  var cc = DataStudioApp.createCommunityConnector();
  return cc
    .newAuthTypeResponse()
    .setAuthType(cc.AuthType.USER_TOKEN)
    .build();
}

function getConfig(request) {
  var cc = DataStudioApp.createCommunityConnector();
  var config = cc.getConfig();
  config
    .newInfo()
    .setId('INFO')
    .setText(
      'Enter the following information for the desired Kaggle dataset. The kaggle URL for datasets will contain the Owner slug and Dataset slug: https://www.kaggle.com/{ownerSlug}/{datasetSlug}. Filename can be found in Data Sources under the "Data" tab in Kaggle UI.'
    );
  config
    .newTextInput()
    .setId('ownerSlug')
    .setName('Owner slug')
    .setPlaceholder(connector.ownerSlug);
  config
    .newTextInput()
    .setId('datasetSlug')
    .setName('Dataset slug')
    .setPlaceholder(connector.datasetSlug);
  config
    .newTextInput()
    .setId('fileName')
    .setName('Filename (CSV files only. Include .csv at end.)')
    .setPlaceholder(connector.fileName);
  return config.build();
}

function getSchema(request) {
  request = validateConfig(request);
  try {
    var result = getFileData(request.configParams);
  } catch (e) {
    var fileUrl = buildBrowsableFileUrl(request.configParams);
    throwConnectorError(
      'Please ensure Owner slug, Dataset slug, and Filename are correct. Unable to find file: ' +
        fileUrl,
      true
    );
  }
  var rawData = result.csvData;
  var cacheKey = result.cacheKey;
  var cache = CacheService.getScriptCache();
  var cachedSchema = JSON.parse(cache.get(cacheKey));
  if (cachedSchema === null) {
    var kaggleSchema = buildSchema(rawData, cacheKey);
  } else {
    var kaggleSchema = cachedSchema;
  }
  return {
    schema: kaggleSchema
  };
}

function validateConfig(request) {
  request.configParams = request.configParams || {};
  var config = request.configParams;
  config.ownerSlug = config.ownerSlug || connector.ownerSlug;
  config.datasetSlug = config.datasetSlug || connector.datasetSlug;
  config.fileName = config.fileName || connector.fileName;

  var fileTypeIsSupported = isFileTypeSupported(config.fileName);
  if (fileTypeIsSupported === false) {
    throwConnectorError('Only .csv filetypes are supported.', true);
  }

  var fileIsSmall = isFileSmall(config);
  if (fileIsSmall === false) {
    throwConnectorError('Please use smaller than 20MB csv files.', true);
  }

  return request;
}

function getData(request) {
  request = validateConfig(request);
  try {
    var result = getFileData(request.configParams);
  } catch (e) {
    var fileUrl = buildBrowsableFileUrl(request.configParams);
    throwConnectorError('Unable to fetch data from file: ' + fileUrl, true);
  }
  var rawData = result.csvData;
  var cacheKey = result.cacheKey;
  var cache = CacheService.getScriptCache();
  var cachedSchema = JSON.parse(cache.get(cacheKey));
  if (cachedSchema === null) {
    var kaggleSchema = buildSchema(rawData, cacheKey);
  } else {
    var kaggleSchema = cachedSchema;
  }
  var requestedSchema = request.fields.map(function(field) {
    for (var i = 0; i < kaggleSchema.length; i++) {
      if (kaggleSchema[i].name == field.name) {
        return kaggleSchema[i];
      }
    }
  });
  var requestedData = processData(rawData, requestedSchema);
  return {
    schema: requestedSchema,
    rows: requestedData
  };
}

function buildSchema(data, cacheKey) {
  var columnNames = data[0];
  var content = data[1];
  var schema = [];
  for (var i = 0; i < columnNames.length; i++) {
    var fieldSchema = mapColumn(i, columnNames[i], content[i]);
    schema.push(fieldSchema);
  }
  var cache = CacheService.getScriptCache();
  cache.put(cacheKey, JSON.stringify(schema));
  return schema;
}

function mapColumn(index, columnName, content) {
  var field = {};
  field.name = 'c' + index;
  field.label = columnName;
  if (isNaN(content)) {
    field.dataType = 'STRING';
    field.semantics = {};
    field.semantics.conceptType = 'DIMENSION';
  } else {
    field.dataType = 'NUMBER';
    field.semantics = {};
    field.semantics.conceptType = 'METRIC';
    field.semantics.isReaggregatable = true;
  }
  return field;
}

function processData(data, fields) {
  var header = data[0];
  var dataIndexes = fields.map(function(field) {
    return header.indexOf(field.label);
  });
  var result = [];
  for (var rowIndex = 1; rowIndex < data.length; rowIndex++) {
    var rowData = dataIndexes.map(function(columnIndex) {
      return data[rowIndex][columnIndex];
    });
    result.push({
      values: rowData
    });
  }
  return result;
}

function getFileData(config) {
  var kaggleAuth = getStoredCredentials();

  var pathElements = [
    connector.apiDownloadSlug,
    config.ownerSlug,
    config.datasetSlug,
    config.fileName
  ];
  var path = pathElements.join('/');

  var response = kaggleFetch(path, kaggleAuth);
  var fileContent = response.getContentText();
  var csvData = Utilities.parseCsv(fileContent);

  pathElements.shift();
  var cacheKey = pathElements.join('--');
  var result = {
    csvData: csvData,
    cacheKey: cacheKey
  };
  return result;
}

function kaggleFetch(path, kaggleAuth) {
  var fullUrl = connector.apiBaseUrl + path;
  var authParamPlain = kaggleAuth.userName + ':' + kaggleAuth.apiToken;
  var authParamBase64 = Utilities.base64Encode(authParamPlain);
  var options = {
    headers: {
      Authorization: 'Basic ' + authParamBase64
    }
  };
  var response = UrlFetchApp.fetch(fullUrl, options);
  return response;
}

function isAuthValid() {
  var kaggleAuth = getStoredCredentials();
  return validateCredentials(kaggleAuth.userName, kaggleAuth.apiToken);
}

function validateCredentials(username, token) {
  if (username === null || token === null) {
    return false;
  }

  // To check if the credentials entered are valid.
  var authParamPlain = username + ':' + token;
  var authParamBase64 = Utilities.base64Encode(authParamPlain);
  var options = {
    headers: {
      Authorization: 'Basic ' + authParamBase64
    }
  };
  try {
    var response = UrlFetchApp.fetch(connector.pingUrl, options);
  } catch (err) {
    return false;
  }
  // Status OK: 200
  // Status unauthorized: 401
  if (response.getResponseCode() == 200) {
    return true;
  }
  return false;
}

// Added for USER_TOKEN auth type.
function setCredentials(request) {
  var creds = request.userToken;
  var username = creds.username;
  var token = creds.token;

  // Optional
  // Check if the provided username and key are valid through a
  // call to your service.
  var validCreds = validateCredentials(username, token);
  if (validCreds === false) {
    return {
      errorCode: 'INVALID_CREDENTIALS'
    };
  }
  var userProperties = PropertiesService.getUserProperties();
  userProperties.setProperty(connector.usernameKey, username);
  userProperties.setProperty(connector.tokenKey, token);
  return {
    errorCode: 'NONE'
  };
}

function resetAuth() {
  var userProperties = PropertiesService.getUserProperties();
  userProperties.deleteProperty(connector.usernameKey);
  userProperties.deleteProperty(connector.tokenKey);
}

function isAdminUser() {
  return false;
}

function throwConnectorError(message, userSafe) {
  userSafe =
    typeof userSafe !== 'undefined' && typeof userSafe === 'boolean'
      ? userSafe
      : false;
  if (userSafe) {
    message = 'DS_USER:' + message;
  }
  throw new Error(message);
}

function buildBrowsableFileUrl(config) {
  var datasetUrlElements = [
    connector.kaggleUrl,
    config.ownerSlug,
    config.datasetSlug
  ];
  var datasetUrl = datasetUrlElements.join('/');
  var fileUrlElements = [datasetUrl, config.fileName];
  var fileUrl = fileUrlElements.join('#');
  return fileUrl;
}

function isFileTypeSupported(filename) {
  var supportedExtension = '.csv';
  var extensionLength = supportedExtension.length;

  var length = filename.length;
  var extension = filename.substring(length - extensionLength, length);
  extension = extension.toLowerCase();

  var fileTypeIsSupported = extension === supportedExtension;

  return fileTypeIsSupported;
}

function getStoredCredentials() {
  var userProperties = PropertiesService.getUserProperties();
  var user = userProperties.getProperty(connector.usernameKey);
  var token = userProperties.getProperty(connector.tokenKey);
  var kaggleAuth = {
    userName: user,
    apiToken: token
  };
  return kaggleAuth;
}

function isFileSmall(config) {
  var apiPath = 'datasets/view';
  var pathElements = [apiPath, config.ownerSlug, config.datasetSlug];
  var fullPath = pathElements.join('/');

  var kaggleAuth = getStoredCredentials();
  var response = kaggleFetch(fullPath, kaggleAuth);
  var fileContent = response.getContentText();
  var csvData = JSON.parse(fileContent);
  var fileList = csvData.files;

  for (fileIndex = 0; fileIndex < fileList.length; fileIndex++) {
    var file = fileList[fileIndex];
    var fileName = file.name;
    if (fileName === config.fileName) {
      return file.totalBytes < connector.fileSizeLimitInBytes;
    }
  }
}
