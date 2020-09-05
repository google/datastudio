/**
 * Creates OAuth2 (3LO) service
 * @return {object} service to connect to Jira using OAuth2
 */
function getJiraService() {
  var clientId = PropertiesService.getScriptProperties().getProperty(
    'OAUTH_CLIENT_ID'
  );
  var clientSecret = PropertiesService.getScriptProperties().getProperty(
    'OAUTH_CLIENT_SECRET'
  );

  return OAuth2.createService('jira')
    .setAuthorizationBaseUrl('https://auth.atlassian.com/authorize')
    .setTokenUrl('https://auth.atlassian.com/oauth/token')
    .setClientId(clientId)
    .setClientSecret(clientSecret)
    .setCallbackFunction('usercallback')
    .setPropertyStore(PropertiesService.getUserProperties())
    .setScope('read:jira-user read:jira-work offline_access')
    .setParam('audience', 'api.atlassian.com')
    .setParam('response_type', 'code')
    .setParam('prompt', 'consent')
    .setParam('grant_type', 'refresh_token')
    .setParam('state', getStateToken('usercallback'));
}
/**
 * Callback for OAuth2 service
 * @param {object} request from authorization service
 */
function usercallback(request) {
  var jiraService = getJiraService();
  var isAuthorized = jiraService.handleCallback(request);
  if (isAuthorized) {
    return HtmlService.createHtmlOutputFromFile('success.html');
  } else {
    return HtmlService.createHtmlOutputFromFile('failed.html');
  }
}
/**
 * Generates state token for OAuth2 authorization request
 * @param {function} callbackFunction after user consent
 * @returns state token used in authorization request as state param
 */
function getStateToken(callbackFunction) {
  var stateToken = ScriptApp.newStateToken()
    .withMethod(callbackFunction)
    .withTimeout(120)
    .createToken();
  return stateToken;
}
