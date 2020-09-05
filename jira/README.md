# Jira Community Connector for Data Studio

*This is not an official Google product*

This [Data Studio][data studio] [Community Connector][community connector] lets you query data about issues in Jira.

![Data Studio Report using the Jira Community Connector][jira report]

## Set up the Community Connector for personal use

To use this Community Connector in Data Studio there is a one-time setup to
deploy your own personal instance of the connector using Apps Script. The
Jira connector also requires a token to call the API.

### 1. Deploy the connector
Follow the [deployment guide] to deploy the Community
Connector.

Make a note of the Script ID for the connector, you'll need it for the next
step.

- To find your `YOUR_SCRIPT_ID`, Visit [Apps Script], then click on
  **File** -> **Project Properties**, and you'll see the id under the **Info**
  tab.

### 2. Atlassian OAuth 2.0 (3LO) App connected to Jira platform REST API
The Jira connector requires an OAuth2 app registered. Follow the steps below to
complete the connector setup.

 1. Go to [Atlassian apps][atlassian apps]
 2. Click *Create a new app*
 3. Provide a name for your app in this case Datastudio and click create.
 4. Complete app information, description and avatar.
 5. Under *APIS AND FEATURES* click *+Add*
 6. Add Jira REST API with scopes read:jira-work and read:jira-user 
 5. Go to OAuth 2.0 (3LO) and set the callback to https://script.google.com/macros/d/{SCRIPT ID}/usercallback find Script Id under **File** -> **Project Properties** -> **Info**
 6. Copy Client ID and Key and add to your script properties under **File** -> **Project Properties** -> **Script Properties** as *CLIENT_ID* and *KEY*

## Using the connector in Data Studio

Once you've set up and deployed the connector, follow the
[Use a Community Connector] guide to use the connector in Data Studio.

**Note**: After using the connector in Data Studio, as long as you do not
[revoke access], it will remain listed in the [connector list] for easy access
when [creating a new data source].

## Troubleshooting

### This app isn't verified

When authorizing the community connector, if you are presented with an
"unverified" warning screen see [This app isn't verified] for details on how to
proceed.

## Developer examples covered in the connector

- **Atlassian OAuth 2.0 (3LO) Apps**  
  Example of how to create an OAuth2 (3LO) App for Atlassian and connected to Jira platform REST API.

[jira report]: Jira-dscc-example.png
[deployment guide]: ../deploy.md
[atlassian apps]: https://developer.atlassian.com/apps/ 
[Apps Script]: https://script.google.com
[data studio]: https://datastudio.google.com
[community connector]: https://developers.google.com/datastudio/connector
[revoke access]: https://support.google.com/datastudio/answer/9053467
[connector list]: https://datastudio.google.com/c/datasources/create
[creating a new data source]: https://support.google.com/datastudio/answer/6300774
[Use a Community Connector]: https://developers.google.com/datastudio/connector/use
[This app isn't verified]: ../verification.md