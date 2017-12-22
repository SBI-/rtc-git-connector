define([
    "dojo/_base/declare",
    "dojo/_base/url",
    "dojo/dom",
    "dojo/dom-style",
    "dojo/on",
    "dojo/keys",
    "./MainDataStore",
    "./JazzRestService",
    "./GitRestService",
    "./SelectRegisteredGitRepository",
    "dijit/_WidgetBase",
    "dijit/_TemplatedMixin",
    "dijit/_WidgetsInTemplateMixin",
    "dijit/Dialog",
    "dijit/form/TextBox",
    "dijit/form/Button",
    "dojo/text!../templates/MainLayout.html"
], function (declare, url, dom, domStyle, on, keys,
    MainDataStore, JazzRestService, GitRestService, SelectRegisteredGitRepository,
    _WidgetBase, _TemplatedMixin, _WidgetsInTemplateMixin,
    Dialog, TextBox, Button, template) {
    return declare("com.siemens.bt.jazz.workitemeditor.rtcGitConnector.ui.widget.mainLayout",
        [_WidgetBase, _TemplatedMixin, _WidgetsInTemplateMixin],
    {
        templateString: template,
        mainDataStore: null,
        jazzRestService: null,
        gitRestService: null,

        constructor: function () {
            this.mainDataStore = MainDataStore.getInstance();
            this.jazzRestService = JazzRestService.getInstance();
            this.gitRestService = GitRestService.getInstance();
        },

        startup: function () {
            this.watchDataStore();
            this.getInitialData();
            this.setEventHandlers();
        },

        setEventHandlers: function () {
            var self = this;
            var originalAccessTokenDialogShow = this.getAccessTokenDialog.show;
            var originalAccessTokenDialogHide = this.getAccessTokenDialog.hide;

            this.getAccessTokenDialog.show = function (hostType) {
                if (hostType === "GITHUB") {
                    domStyle.set("getGitHubAccessTokenContainer", "display", "block");
                } else if (hostType === "GITLAB") {
                    domStyle.set("getGitLabAccessTokenContainer", "display", "block");
                }

                self.saveAccessTokenButton.setDisabled(true);
                originalAccessTokenDialogShow.apply(self.getAccessTokenDialog);
            };

            this.getAccessTokenDialog.hide = function () {
                originalAccessTokenDialogHide.apply(self.getAccessTokenDialog);

                // Prevent the user from seeing the content being removed
                window.setTimeout(function () {
                    domStyle.set("getGitHubAccessTokenContainer", "display", "none");
                    domStyle.set("getGitLabAccessTokenContainer", "display", "none");
                }, 200);
            };

            on(this.accessTokenInput, "keydown", function (event) {
                if (event.keyCode === keys.ENTER) {
                    // Run the submit function when the enter key is pressed
                    event.preventDefault();
                    console.log("enter key pressed");
                }

                window.setTimeout(function () {
                    if (self.accessTokenInput.displayedValue.trim()) {
                        self.saveAccessTokenButton.setDisabled(false);
                    } else {
                        self.saveAccessTokenButton.setDisabled(true);
                    }
                }, 10);
            });

            this.saveAccessTokenButton.onClick = function (event) {
                self.saveAccessTokenButton.setDisabled(true);
                console.log("access token input value", self.accessTokenInput.value);
                self.getAccessTokenDialog.hide();
            };

            this.cancelAccessTokenButton.onClick = function (event) {
                self.getAccessTokenDialog.hide();
            };
        },

        getInitialData: function () {
            var self = this;

            // Get registered git repositories from Jazz
            this.jazzRestService.getAllRegisteredGitRepositoriesForProjectArea(this.mainDataStore.projectArea.id)
                .then(function (registeredGitRepositories) {
                    // Sort the repositories before adding to the store to prevent an extra change event
                    self._sortArrayByNameProperty(registeredGitRepositories);

                    // Use push.apply to add multiple elements at once so that only one change event is caused
                    self.mainDataStore.registeredGitRepositories.push.apply(self.mainDataStore.registeredGitRepositories, registeredGitRepositories);

                    // Show an element if no repositories where found
                    domStyle.set("noRegisteredGitRepositoriesContainer", "display", !registeredGitRepositories.length ? "block" : "none");
            });

            // Get the current user from Jazz
            this.jazzRestService.getCurrentUserId().then(function (userId) {
                // Set the current user id in the sore.
                // Be aware that the currentUserId can be null
                self.mainDataStore.currentUserId = userId;
            });
        },

        watchDataStore: function () {
            var self = this;

            // React when the selected repository changes
            this.mainDataStore.selectedRepositorySettings.watch("repository", function (name, oldValue, value) {
                domStyle.set("noGitRepositorySelectedContainer", "display", value === null ? "block" : "none");

                // Reset the selected repository settings because it has changed
                self.resetSelectedRepositorySettings();

                // Don't continue if the repository was set to null
                if (value !== null) {
                    // Determine the git host, then get / set the access token
                    self.determineSelectedRepositoryGitHost();
                }
            });

            // React when the selected repository host type changes
            this.mainDataStore.selectedRepositorySettings.watch("gitHost", function (name, oldValue, value) {
                var valueIsValid = (value === "GITHUB" || value === "GITLAB");
                domStyle.set("invalidGitRepositoryTypeContainer", "display", (valueIsValid || value === null) ? "none" : "block");
                dom.byId("selectedRegisteredGitRepositoryContainer").innerHTML = value; // remove this later

                // Get the access token if the host type is valid
                if (valueIsValid) {
                    self.getAccessTokenForSelectedRepository();
                }
            });
        },

        // Reset all settings except for the "repository" itself
        resetSelectedRepositorySettings: function () {
            this.mainDataStore.selectedRepositorySettings.set("gitHost", null);
            this.mainDataStore.selectedRepositorySettings.set("accessToken", null);
        },

        // Find out if the selected git repository is hosted on GitHub, GitLab, or neither of the two
        determineSelectedRepositoryGitHost: function () {
            var self = this;

            // Set the git host in the data store once it has been determined.
            if (typeof this.mainDataStore.selectedRepositorySettings.repository.configurationData.git_hosted_server === "string") {
                // Set from the config
                this.mainDataStore.selectedRepositorySettings
                    .set("gitHost", this.mainDataStore.selectedRepositorySettings.repository.configurationData.git_hosted_server.toUpperCase());
            } else {
                // Make requests to find the type and then set it
                this.gitRestService.determineRepositoryGitHost(this.mainDataStore.selectedRepositorySettings.get("repository"))
                    .then(function (hostType) {
                        self.mainDataStore.selectedRepositorySettings.set("gitHost", hostType.toUpperCase());
                });
            }
        },

        // Get the access token for the host of the selected git repository
        getAccessTokenForSelectedRepository: function () {
            var self = this;
            var selectedRepository = this.mainDataStore.selectedRepositorySettings.get("repository");
            var repositoryUrl = new url(selectedRepository.url);
            var gitHost = this.mainDataStore.selectedRepositorySettings.get("gitHost");

            this.jazzRestService.getAccessTokenByHost(repositoryUrl.host).then(function (accessToken) {
                domStyle.set("couldNotGetAccessTokenContainer", "display", "none");

                if (accessToken) {
                    // Check the access token (store if works)
                    self.checkAccessTokenForSelectedRepository(accessToken);
                } else {
                    // Ask for an access token if the user doesn't already have one
                    self.getAccessTokenDialog.show(gitHost);
                }
            }, function (error) {
                // Service error. Can't continue here
                domStyle.set("couldNotGetAccessTokenContainer", "display", "block");
            });
        },

        // Check if the access token works for the repository.
        // Set the token in the store if it does
        checkAccessTokenForSelectedRepository: function (accessToken) {
            var self = this;
            var selectedRepository = this.mainDataStore.selectedRepositorySettings.get("repository");
            var repositoryUrl = new url(selectedRepository.url);
            var gitHost = this.mainDataStore.selectedRepositorySettings.get("gitHost");

            this.gitRestService.checkAccessToken(repositoryUrl, gitHost, accessToken)
                .then(function (isTokenValid) {
                    if (isTokenValid) {
                        // Store the token in the service and store if it's valid
                        console.log("The access token is valid.");
                        self.saveAccessTokenForSelectedRepository(accessToken);
                    } else {
                        // Ask for a new token if it's invalid
                        self.getAccessTokenDialog.show(gitHost);
                    }
                });
        },

        // Sets the token in the store and also saves it with the service
        saveAccessTokenForSelectedRepository: function (accessToken) {
            // todo
        },

        // Sorts an array of objects alphabetically by their name property
        _sortArrayByNameProperty: function (objectsWithNames) {
            objectsWithNames.sort(function (a, b) {
                return a.name.localeCompare(b.name);
            });
        }
    });
});