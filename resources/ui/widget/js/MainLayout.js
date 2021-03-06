define([
    "dojo/_base/declare",
    "dojo/_base/url",
    "dojo/dom",
    "dojo/dom-construct",
    "dojo/dom-style",
    "dojo/on",
    "dojo/keys",
    "./DataStores/MainDataStore",
    "./RestServices/JazzRestService",
    "./RestServices/GitRestService",
    "./SelectRegisteredGitRepository",
    "./SelectLinkType",
    "dijit/_WidgetBase",
    "dijit/_TemplatedMixin",
    "dijit/_WidgetsInTemplateMixin",
    "dijit/registry",
    "dijit/Dialog",
    "dijit/form/TextBox",
    "dijit/form/Button",
    "dojo/text!../templates/MainLayout.html"
], function (declare, url, dom, domConstruct, domStyle, on, keys,
    MainDataStore, JazzRestService, GitRestService,
    SelectRegisteredGitRepository, SelectLinkType,
    _WidgetBase, _TemplatedMixin, _WidgetsInTemplateMixin,
    registry, Dialog, TextBox, Button, template) {
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
            // Manually call the startup methods from custom widgets used in the template
            this.selectRegisteredGitRepository.startup();
            this.selectLinkType.startup();

            this.watchDataStore();
            this.getInitialData();
            this.setEventHandlers();
        },

        setEventHandlers: function () {
            var self = this;
            var originalAccessTokenDialogShow = this.getAccessTokenDialog.show;

            this.getAccessTokenDialog.show = function (hostType) {
                if (hostType === "GITHUB") {
                    domStyle.set("getGitHubAccessTokenContainer", "display", "block");
                    domStyle.set("getGitLabAccessTokenContainer", "display", "none");
                } else if (hostType === "GITLAB") {
                    domStyle.set("getGitHubAccessTokenContainer", "display", "none");
                    domStyle.set("getGitLabAccessTokenContainer", "display", "block");
                } else {
                    domStyle.set("getGitHubAccessTokenContainer", "display", "none");
                    domStyle.set("getGitLabAccessTokenContainer", "display", "none");
                }

                self.accessTokenInput.setValue("");
                self.saveAccessTokenButton.setDisabled(true);
                originalAccessTokenDialogShow.apply(self.getAccessTokenDialog);
            };

            // Function to run when save button is clicked or the enter key is pressed
            var saveAccessTokenButtonClick = function (event) {
                var accessTokenInputValue = self.accessTokenInput.value;
                self.saveAccessTokenButton.setDisabled(true);

                // Hide the dialog and check the access token
                self.getAccessTokenDialog.hide().then(function () {
                    // Wait for the dialog to be hidden before checking the token.
                    // Otherwise the check function might open a new dialog before
                    // this one is finished closing
                    self.saveAccessTokenForSelectedRepository(accessTokenInputValue);
                    self.checkAccessTokenForSelectedRepository(accessTokenInputValue);
                });
            };

            on(this.accessTokenInput, "keydown, paste", function (event) {
                if (event.keyCode === keys.ENTER) {
                    // Run the submit function when the enter key is pressed
                    event.preventDefault();

                    // Delay checking the value so that the new value is used
                    window.setTimeout(function () {
                        if (self.accessTokenInput.displayedValue.trim()) {
                            // Focus the save button so that the input value is updated
                            document.getElementById('saveAccessTokenButton').focus();
                            saveAccessTokenButtonClick();
                        }
                    }, 10);
                } else {
                    // Delay checking the value so that the new value is used
                    window.setTimeout(function () {
                        if (self.accessTokenInput.displayedValue.trim()) {
                            self.saveAccessTokenButton.setDisabled(false);
                        } else {
                            self.saveAccessTokenButton.setDisabled(true);
                        }
                    }, 10);
                }
            });

            this.saveAccessTokenButton.onClick = saveAccessTokenButtonClick;

            this.cancelAccessTokenButton.onClick = function (event) {
                self.getAccessTokenDialog.hide();
            };

            var saveButtonClick = function (event) {
                // Check if there is anything to save
                if (self.mainDataStore.selectedRepositoryData.commitsToLink.length > 0 ||
                    self.mainDataStore.selectedRepositoryData.issuesToLink.length > 0 ||
                    self.mainDataStore.selectedRepositoryData.requestsToLink.length > 0) {
                    var selectedRepository = self.mainDataStore.selectedRepositorySettings.get("repository");
                    var gitHost = self.mainDataStore.selectedRepositorySettings.get("gitHost");
                    var accessToken = self.mainDataStore.selectedRepositorySettings.get("accessToken");

                    // Show a loading overlay to disable the view until the save is complete
                    domStyle.set("rtcGitConnectorFullPageLoadingOverlay", "display", "block");

                    var saveTheLinks = function () {
                        // There are no more hidden changes because they will be saved
                        self.mainDataStore.hasHiddenChanges = false;
                        // Save the links
                        self.jazzRestService.addLinksToWorkItem(self.mainDataStore.workItem,
                            selectedRepository,
                            self.mainDataStore.selectedRepositoryData.commitsToLink,
                            self.mainDataStore.selectedRepositoryData.issuesToLink,
                            self.mainDataStore.selectedRepositoryData.requestsToLink,
                            function () {
                            // This function runs after the work item was successfully saved
                            var addBackLinksToGitHostParams = {
                                selectedGitRepository: selectedRepository,
                                gitHost: gitHost,
                                accessToken: accessToken,
                                currentUser: self.mainDataStore.currentUserId,
                                workItem: self.mainDataStore.workItem,
                                commitsToLink: self.mainDataStore.selectedRepositoryData.commitsToLink,
                                issuesToLink: self.mainDataStore.selectedRepositoryData.issuesToLink,
                                requestsToLink: self.mainDataStore.selectedRepositoryData.requestsToLink
                            };
                            self.gitRestService.addBackLinksToGitHost(addBackLinksToGitHostParams).then(function (result) {
                                // Hide the loading overlay
                                domStyle.set("rtcGitConnectorFullPageLoadingOverlay", "display", "none");

                                if (event.target.id === "rtcGitConnectorSaveAndCloseButton") {
                                    // Hide the widget
                                    self._hideMainDialog();
                                } else {
                                    // Set the selected repository to it's current value to trigger a change event.
                                    // This reloads the view so that the user can keep on working without reopening the widget
                                    self.mainDataStore.selectedRepositorySettings.set("repository", selectedRepository);
                                }
                            }, function (error) {
                                domStyle.set("rtcGitConnectorFullPageLoadingOverlay", "display", "none");

                                if (event.target.id === "rtcGitConnectorSaveAndCloseButton") {
                                    self._hideMainDialog();
                                } else {
                                    self.mainDataStore.selectedRepositorySettings.set("repository", selectedRepository);
                                }

                                console.log("Error adding back links: ", error);
                            });
                        });
                    };

                    // Check if a new issue should be created
                    var newIssueIndex = self.mainDataStore.selectedRepositoryData.issuesToLink.findIndex(function (issue) {
                        return issue.id < 0;
                    });

                    if (newIssueIndex >= 0) {
                        // Remove the fake new issue from the issues to link
                        self.mainDataStore.selectedRepositoryData.issuesToLink.splice(newIssueIndex, 1);

                        // Create the issue with the title and description of the work item
                        self.gitRestService.createNewIssue(selectedRepository, gitHost, accessToken, self.mainDataStore.workItem)
                            .then(function (result) {
                            // Get the new issue and add it to the list of issues to link
                            self.mainDataStore.selectedRepositoryData.issuesToLink.push(result);

                            // Continue with the normal saving.
                            saveTheLinks();
                        }, function (error) {
                            console.log("Sorry! We could not create a new issue. " +
                                "We'll still try to create any other links. Error message: " + error);
                            saveTheLinks();
                        });
                    } else {
                        saveTheLinks();
                    }
                } else if (event.target.id === "rtcGitConnectorSaveAndCloseButton") {
                    // Hide the widget
                    self._hideMainDialog();
                }
            };

            on(dom.byId("rtcGitConnectorSaveButton"), "click", saveButtonClick);
            on(dom.byId("rtcGitConnectorSaveAndCloseButton"), "click", saveButtonClick);

            on(dom.byId("rtcGitConnectorCancelButton"), "click", function (event) {
                self._hideMainDialog();
            });
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

            // Add the font awesome icon to the loading screen
            var fontAwesome = com_siemens_bt_jazz_rtcgitconnector_modules.FontAwesome;
            var icon = fontAwesome.icon({ prefix: 'fas', iconName: "spinner" }, { classes: ['fa-pulse'] });
            domConstruct.create("span", {
                innerHTML: icon.html[0]
            }, "rtcGitConnectorSavingSpinnerIcon");
        },

        watchDataStore: function () {
            var self = this;

            // React when the selected repository changes
            this.mainDataStore.selectedRepositorySettings.watch("repository", function (name, oldValue, value) {
                domStyle.set("noGitRepositorySelectedContainer", "display", value === null ? "block" : "none");

                // Reset the selected repository settings and data because it has changed
                self.mainDataStore.resetSelectedRepository();

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

                // Get the access token if the host type is valid
                if (valueIsValid) {
                    self.getAccessTokenForSelectedRepository();
                }
            });

            // React when the access token changes
            this.mainDataStore.selectedRepositorySettings.watch("accessToken", function (name, oldValue, value) {
                // Set the default link type if the access token is not null
                if (value) {
                    // Set the link type to issue (as default)
                    self.mainDataStore.selectedRepositorySettings.set("linkType", "ISSUE");
                }
            });
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
                        // Set the token in the store if it's valid
                        self.mainDataStore.selectedRepositorySettings.set("accessToken", accessToken);
                    } else {
                        // Ask for a new token if it's invalid
                        self.getAccessTokenDialog.show(gitHost);
                    }
                });
        },

        // Saves the access token with the service
        saveAccessTokenForSelectedRepository: function (accessToken) {
            var selectedRepository = this.mainDataStore.selectedRepositorySettings.get("repository");
            var repositoryUrl = new url(selectedRepository.url);

            this.jazzRestService.saveAccessTokenByHost(repositoryUrl.host, accessToken);
        },

        // Sorts an array of objects alphabetically by their name property
        _sortArrayByNameProperty: function (objectsWithNames) {
            objectsWithNames.sort(function (a, b) {
                return a.name.localeCompare(b.name);
            });
        },

        _hideMainDialog: function () {
            // Get the mainDialog by it's dom id
            var mainDialog = registry.byId("connectWithGitMainDialog");

            // Save hidden changes before closing if there are any
            if (this.mainDataStore.hasHiddenChanges) {
                domStyle.set("rtcGitConnectorFullPageLoadingOverlay", "display", "block");
                this.jazzRestService.saveLinksInWorkItem(this.mainDataStore.workItem, function () {
                    domStyle.set("rtcGitConnectorFullPageLoadingOverlay", "display", "none");
                    mainDialog.hide();
                });
            } else {
                mainDialog.hide();
            }
        }
    });
});