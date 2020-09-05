var cc = DataStudioApp.createCommunityConnector();
/**
 * Builds the Community Connector config.
 * @return {Config} The Community Connector config.
 * @see https://developers.google.com/apps-script/reference/data-studio/config
 */
function getConfig(request) {
  var configParams = request.configParams;
  var isFirstRequest = configParams === undefined;
  var config = cc.getConfig();
  if (isFirstRequest) {
    config.setIsSteppedConfig(true);
  }
  config
    .newInfo()
    .setId('Info')
    .setText(
      'You can choose filters created in Jira or custom JQL. When using custom JQL "startDate" and "endDate" will be replaced with date range.'
    );
  config
    .newSelectSingle()
    .setHelpText('Select the desired mode to search for issues.')
    .setId('mode')
    .setName('Mode')
    .setIsDynamic(true)
    .setAllowOverride(false)
    .addOption(
      config
        .newOptionBuilder()
        .setLabel('Custom JQL')
        .setValue('jql')
    )
    .addOption(
      config
        .newOptionBuilder()
        .setLabel('User filters')
        .setValue('filters')
    );
  if (!isFirstRequest) {
    if (configParams.mode === undefined) {
      cc.newUserError()
        .setText('You must choose a mode.')
        .throwException();
    }
    switch (configParams.mode) {
      case 'jql': {
        config
          .newTextArea()
          .setId('jql')
          .setName('JQL')
          .setHelpText('Enter JQL to search issues.')
          .setPlaceholder(
            'project in (AA, BB) and created >= "startDate" and created <= "endDate"'
          )
          .setAllowOverride(true);
        break;
      }
      case 'filters': {
        var userFilters = getFromJira('/rest/api/3/filter/my');
        var filterSelector = config
          .newSelectSingle()
          .setId('userFilters')
          .setName('User filters')
          .setHelpText('Select the desired filter')
          .setAllowOverride(true);
        userFilters.forEach(function(filter) {
          filterSelector.addOption(
            config
              .newOptionBuilder()
              .setLabel(filter.name)
              .setValue(filter.jql)
          );
        });
        break;
      }
      default: {
        cc.newUserError()
          .setText('You must either select "JQL" or "Filters"')
          .throwException();
      }
    }
  }
  config.setDateRangeRequired(true);
  return config.build();
}
