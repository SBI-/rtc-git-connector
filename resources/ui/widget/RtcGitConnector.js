define([
    "dojo/_base/declare",
    "dojo/dom",
    "dojo/dom-style",
    "dojo/topic",
    "./js/MainLayout",
    "./js/MainDataStore",
    "./_AbstractActionWidget",
    "dijit/_TemplatedMixin",
    "dijit/_WidgetsInTemplateMixin",
    "dijit/registry",
    "dijit/Dialog",
    "dojo/text!./templates/RtcGitConnector.html"
], function (declare, dom, domStyle, topic,
    MainLayout, MainDataStore,
    _AbstractActionWidget, _TemplatedMixin, _WidgetsInTemplateMixin,
    registry, Dialog, template) {
    return declare([_AbstractActionWidget, _TemplatedMixin, _WidgetsInTemplateMixin], {
        templateString: template,
        mainDataStore: null,

        constructor: function () {
            console.log("MainDataStore", MainDataStore);
            this.mainDataStore = MainDataStore.getInstance();
            this.mainDataStore.workItem = this.workItem;
            this.mainDataStore.projectArea = this.workItem.object.attributes.projectArea;
        },

        startup: function () {
            this.setEventHandlers();
            this.mainDialog.startup();
            this.mainDialog.show();
            topic.publish("rtcGitConnector/workItem", this.workItem);
        },

        setEventHandlers: function () {
            var self = this;

            this.mainDialog.onHide = function () {
                // Destroy all dialogs and remove them from the dom
                self.destroyWidgetById("com-siemens-bt-jazz-workitemeditor-rtcGitConnector-ui-widget-selectRegisteredGitRepository");
                self.destroyWidgetById("mainLayoutMyDialog");
                self.destroyWidgetById("com-siemens-bt-jazz-workitemeditor-rtcGitConnector-ui-widget-mainLayout");
                this.destroyRecursive(false);

                // Destroy the data store
                MainDataStore.destroyInstance();
            };
        },

        destroyWidgetById: function (domId) {
            var widgetToDestroy = registry.byId(domId);

            if (widgetToDestroy) {
                widgetToDestroy.destroyRecursive(false);
            }
        }
    });
});