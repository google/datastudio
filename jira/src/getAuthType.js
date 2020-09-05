/**
 * Returns if user is admin
 * {boolean} true if user is current user is admin.
 */
function isAdminUser() {
  return false;
}

/**
 * Returns the Auth Type of this connector.
 * @return {object} The Auth type.
 */
function getAuthType() {
  var cc = DataStudioApp.createCommunityConnector();
  return cc
    .newAuthTypeResponse()
    .setAuthType(cc.AuthType.OAUTH2)
    .build();
}

/**
 * Resets the auth service.
 */
function resetAuth() {
  getJiraService().reset();
}

/**
 * Returns true if the auth service has access.
 * @return {boolean} True if the auth service has access.
 */
function isAuthValid() {
  return getJiraService().hasAccess();
}
/**
 * Gets the 3P authorization URL.
 * @return {string} The authorization URL.
 * @see https://developers.google.com/apps-script/reference/script/authorization-info
 */
function get3PAuthorizationUrls() {
  return getJiraService().getAuthorizationUrl();
}
