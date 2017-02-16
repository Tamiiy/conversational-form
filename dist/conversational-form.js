// version 0.9.0
/// <reference path="ui/UserInput.ts"/>
/// <reference path="ui/chat/ChatList.ts"/>
/// <reference path="logic/FlowManager.ts"/>
/// <reference path="form-tags/Tag.ts"/>
/// <reference path="form-tags/TagGroup.ts"/>
/// <reference path="form-tags/InputTag.ts"/>
/// <reference path="form-tags/SelectTag.ts"/>
/// <reference path="form-tags/ButtonTag.ts"/>
/// <reference path="data/Dictionary.ts"/>
var cf;
(function (cf) {
    var ConversationalForm = (function () {
        function ConversationalForm(options) {
            this.isDevelopment = false;
            this.loadExternalStyleSheet = true;
            this.preventAutoAppend = false;
            if (!window.ConversationalForm)
                window.ConversationalForm = this;
            // set a general step validation callback
            if (options.flowStepCallback)
                cf.FlowManager.generalFlowStepCallback = options.flowStepCallback;
            if (document.getElementById("conversational-form-development") || options.loadExternalStyleSheet == false) {
                this.loadExternalStyleSheet = false;
            }
            if (!isNaN(options.scrollAccerlation))
                cf.ScrollController.accerlation = options.scrollAccerlation;
            if (options.preventAutoAppend == true)
                this.preventAutoAppend = true;
            if (!options.formEl)
                throw new Error("Conversational Form error, the formEl needs to be defined.");
            this.formEl = options.formEl;
            this.submitCallback = options.submitCallback;
            if (this.formEl.getAttribute("cf-no-animation") == "")
                ConversationalForm.animationsEnabled = false;
            if (this.formEl.getAttribute("cf-prevent-autofocus") == "")
                cf.UserInput.preventAutoFocus = true;
            this.dictionary = new cf.Dictionary({
                data: options.dictionaryData,
                robotData: options.dictionaryRobot,
                userImage: options.userImage,
                robotImage: options.robotImage,
            });
            // emoji.. fork and set your own values..
            cf.Helpers.setEmojiLib();
            this.context = options.context ? options.context : document.body;
            this.tags = options.tags;
            this.init();
        }
        ConversationalForm.prototype.init = function () {
            if (this.loadExternalStyleSheet) {
                // not in development/examples, so inject production css
                var head = document.head || document.getElementsByTagName("head")[0];
                var style = document.createElement("link");
                var githubMasterUrl = "//conversational-form-0iznjsw.stackpathdns.com/conversational-form.min.css";
                style.type = "text/css";
                style.media = "all";
                style.setAttribute("rel", "stylesheet");
                style.setAttribute("href", githubMasterUrl);
                head.appendChild(style);
            }
            else {
                // expect styles to be in the document
                this.isDevelopment = true;
            }
            // set context position to relative, else we break out of the box
            var position = window.getComputedStyle(this.context).getPropertyValue("position").toLowerCase();
            if (["fixed", "absolute", "relative"].indexOf(position) == -1) {
                this.context.style.position = "relative";
            }
            // if tags are not defined then we will try and build some tags our selves..
            if (!this.tags || this.tags.length == 0) {
                this.tags = [];
                var fields = [].slice.call(this.formEl.querySelectorAll("input, select, button, textarea"), 0);
                for (var i = 0; i < fields.length; i++) {
                    var element = fields[i];
                    if (cf.Tag.isTagValid(element)) {
                        // ignore hidden tags
                        this.tags.push(cf.Tag.createTag(element));
                    }
                }
            }
            else {
            }
            // remove invalid tags if they've sneaked in.. this could happen if tags are setup manually as we don't encurage to use static Tag.isTagValid
            var indexesToRemove = [];
            for (var i = 0; i < this.tags.length; i++) {
                var element = this.tags[i];
                if (!element || !cf.Tag.isTagValid(element.domElement)) {
                    indexesToRemove.push(element);
                }
            }
            for (var i = 0; i < indexesToRemove.length; i++) {
                var tag = indexesToRemove[i];
                this.tags.splice(this.tags.indexOf(tag), 1);
            }
            if (!this.tags || this.tags.length == 0) {
                console.warn("Conversational Form: no tags found/registered!");
            }
            //let's start the conversation
            this.setupTagGroups();
            this.setupUI();
            return this;
        };
        /**
        * @name updateDictionaryValue
        * set a dictionary value at "runtime"
        *	id: string, id of the value to update
        *	type: string, "human" || "robot"
        *	value: string, value to be inserted
        */
        ConversationalForm.prototype.updateDictionaryValue = function (id, type, value) {
            cf.Dictionary.set(id, type, value);
            if (["robot-image", "user-image"].indexOf(id) != -1) {
                this.chatList.updateThumbnail(id == "robot-image", value);
            }
        };
        ConversationalForm.prototype.getFormData = function () {
            var formData = new FormData(this.formEl);
            return formData;
        };
        ConversationalForm.prototype.addRobotChatResponse = function (response) {
            this.chatList.createResponse(true, null, response);
        };
        ConversationalForm.prototype.stop = function (optionalStoppingMessage) {
            if (optionalStoppingMessage === void 0) { optionalStoppingMessage = ""; }
            this.flowManager.stop();
            if (optionalStoppingMessage != "")
                this.chatList.createResponse(true, null, optionalStoppingMessage);
            this.userInput.onFlowStopped();
        };
        ConversationalForm.prototype.start = function () {
            this.userInput.disabled = false;
            this.userInput.visible = true;
            this.flowManager.start();
        };
        ConversationalForm.prototype.getTag = function (nameOrIndex) {
            if (typeof nameOrIndex == "number") {
                return this.tags[nameOrIndex];
            }
            else {
                // TODO: fix so you can get a tag by its name attribute
                return null;
            }
        };
        ConversationalForm.prototype.setupTagGroups = function () {
            // make groups, from input tag[type=radio | type=checkbox]
            // groups are used to bind logic like radio-button or checkbox dependencies
            var groups = [];
            for (var i = 0; i < this.tags.length; i++) {
                var tag = this.tags[i];
                if (tag.type == "radio" || tag.type == "checkbox") {
                    if (!groups[tag.name])
                        groups[tag.name] = [];
                    console.log(this.constructor.name, 'tag.name]:', tag.name);
                    groups[tag.name].push(tag);
                }
            }
            if (Object.keys(groups).length > 0) {
                for (var group in groups) {
                    if (groups[group].length > 0) {
                        // always build groupd when radio or checkbox
                        var tagGroup = new cf.TagGroup({
                            elements: groups[group]
                        });
                        // remove the tags as they are now apart of a group
                        for (var i = 0; i < groups[group].length; i++) {
                            var tagToBeRemoved = groups[group][i];
                            if (i == 0)
                                this.tags.splice(this.tags.indexOf(tagToBeRemoved), 1, tagGroup);
                            else
                                this.tags.splice(this.tags.indexOf(tagToBeRemoved), 1);
                        }
                    }
                }
            }
        };
        ConversationalForm.prototype.setupUI = function () {
            var _this = this;
            console.log('Conversational Form > start > mapped DOM tags:', this.tags);
            console.log('----------------------------------------------');
            // start the flow
            this.flowManager = new cf.FlowManager({
                cuiReference: this,
                tags: this.tags
            });
            this.el = document.createElement("div");
            this.el.id = "conversational-form";
            this.el.className = "conversational-form";
            if (ConversationalForm.animationsEnabled)
                this.el.classList.add("conversational-form--enable-animation");
            // add conversational form to context
            if (!this.preventAutoAppend)
                this.context.appendChild(this.el);
            //hide until stylesheet is rendered
            this.el.style.visibility = "hidden";
            var innerWrap = document.createElement("div");
            innerWrap.className = "conversational-form-inner";
            this.el.appendChild(innerWrap);
            // Conversational Form UI
            this.chatList = new cf.ChatList({});
            innerWrap.appendChild(this.chatList.el);
            this.userInput = new cf.UserInput({});
            innerWrap.appendChild(this.userInput.el);
            this.onUserAnswerClickedCallback = this.onUserAnswerClicked.bind(this);
            document.addEventListener(cf.ChatResponseEvents.USER_ANSWER_CLICKED, this.onUserAnswerClickedCallback, false);
            setTimeout(function () {
                // if for some reason conversational form is removed prematurely, then make sure it does not throw an error..
                if (_this.el && _this.flowManager) {
                    _this.el.classList.add("conversational-form--show");
                    _this.flowManager.start();
                }
            }, 0);
        };
        /**
        * @name onUserAnswerClicked
        * on user ChatReponse clicked
        */
        ConversationalForm.prototype.onUserAnswerClicked = function (event) {
            this.chatList.onUserWantToEditPreviousAnswer(event.detail);
            this.flowManager.editTag(event.detail);
        };
        /**
        * @name remapTagsAndStartFrom
        * index: number, what index to start from
        * setCurrentTagValue: boolean, usually this method is called when wanting to loop or skip over questions, therefore it might be usefull to set the valie of the current tag before changing index.
        */
        ConversationalForm.prototype.remapTagsAndStartFrom = function (index, setCurrentTagValue) {
            if (index === void 0) { index = 0; }
            if (setCurrentTagValue === void 0) { setCurrentTagValue = false; }
            if (setCurrentTagValue) {
                this.chatList.setCurrentResponse(this.userInput.getFlowDTO());
            }
            // possibility to start the form flow over from {index}
            for (var i = 0; i < this.tags.length; i++) {
                var tag = this.tags[i];
                tag.refresh();
            }
            this.flowManager.startFrom(index);
        };
        ConversationalForm.prototype.doSubmitForm = function () {
            this.el.classList.add("done");
            if (this.submitCallback) {
                // remove should be called in the submitCallback
                this.submitCallback();
            }
            else {
                this.formEl.submit();
                this.remove();
            }
        };
        ConversationalForm.prototype.remove = function () {
            if (this.onUserAnswerClickedCallback) {
                document.removeEventListener(cf.ChatResponseEvents.USER_ANSWER_CLICKED, this.onUserAnswerClickedCallback, false);
                this.onUserAnswerClickedCallback = null;
            }
            if (this.flowManager)
                this.flowManager.dealloc();
            if (this.userInput)
                this.userInput.dealloc();
            if (this.chatList)
                this.chatList.dealloc();
            this.dictionary = null;
            this.flowManager = null;
            this.userInput = null;
            this.chatList = null;
            this.context = null;
            this.formEl = null;
            this.submitCallback = null;
            this.el.parentNode.removeChild(this.el);
            this.el = null;
        };
        ConversationalForm.illustrateFlow = function (classRef, type, eventType, detail) {
            // ConversationalForm.illustrateFlow(this, "dispatch", FlowEvents.USER_INPUT_INVALID, event.detail);
            // ConversationalForm.illustrateFlow(this, "receive", event.type, event.detail);
            if (detail === void 0) { detail = null; }
            if (ConversationalForm.ILLUSTRATE_APP_FLOW && navigator.appName != 'Netscape') {
                var highlight = "font-weight: 900; background: pink; color: black; padding: 0px 5px;";
                console.log("%c** event flow: %c" + eventType + "%c flow type: %c" + type + "%c from: %c" + classRef.constructor.name, "font-weight: 900;", highlight, "font-weight: 400;", highlight, "font-weight: 400;", highlight);
                if (detail)
                    console.log("** event flow detail:", detail);
            }
        };
        return ConversationalForm;
    }());
    ConversationalForm.animationsEnabled = true;
    // to illustrate the event flow of the app
    ConversationalForm.ILLUSTRATE_APP_FLOW = true;
    cf.ConversationalForm = ConversationalForm;
})(cf || (cf = {}));
// check for a form element with attribute:
window.addEventListener("load", function () {
    var formEl = document.querySelector("form[cf-form]") || document.querySelector("form[cf-form-element]");
    var contextEl = document.querySelector("*[cf-context]");
    if (formEl && !window.ConversationalForm) {
        window.ConversationalForm = new cf.ConversationalForm({
            formEl: formEl,
            context: contextEl
        });
    }
}, false);

(function (factory) {
	if (typeof define === 'function' && define.amd) {
		// AMD. Register as an anonymous module depending on jQuery.
		define(['jquery'], factory);
	} else {
		// No AMD. Register plugin with global jQuery object.
		try{
			factory(jQuery);
		}catch(e){
			// whoops no jquery..
		}
	}
	}(function ($) {
		$.fn.conversationalForm = function (options /* ConversationalFormOptions, see README */) {
			options = options || {};
			if(!options.formEl)
				options.formEl = this[0];
			return new cf.ConversationalForm(options);
		};
	}
));
// namespace
var cf;
(function (cf) {
    // interface
    // class
    var Helpers = (function () {
        function Helpers() {
        }
        Helpers.lerp = function (norm, min, max) {
            return (max - min) * norm + min;
        };
        Helpers.norm = function (value, min, max) {
            return (value - min) / (max - min);
        };
        Helpers.getXYFromMouseTouchEvent = function (event) {
            var touches = null;
            if (event.originalEvent)
                touches = event.originalEvent.touches || event.originalEvent.changedTouches;
            else if (event.changedTouches)
                touches = event.changedTouches;
            if (touches) {
                return { x: touches[0].pageX, y: touches[0].pageY, touches: touches[0] };
            }
            else {
                return { x: event.pageX, y: event.pageY, touches: null };
            }
        };
        Helpers.getInnerTextOfElement = function (element) {
            var tmp = document.createElement("DIV");
            tmp.innerHTML = element.innerHTML;
            return tmp.textContent || tmp.innerText || "";
        };
        Helpers.getMouseEvent = function (eventString) {
            var mappings = [];
            mappings["click"] = "ontouchstart" in window ? "touchstart" : "click";
            mappings["mousedown"] = "ontouchstart" in window ? "touchstart" : "mousedown";
            mappings["mouseup"] = "ontouchstart" in window ? "touchend" : "mouseup";
            mappings["mousemove"] = "ontouchstart" in window ? "touchmove" : "mousemove";
            return mappings[eventString];
        };
        Helpers.setEmojiLib = function (lib, scriptSrc) {
            if (lib === void 0) { lib = "emojify"; }
            if (scriptSrc === void 0) { scriptSrc = "//cdnjs.cloudflare.com/ajax/libs/emojify.js/1.1.0/js/emojify.min.js"; }
            var head = document.head || document.getElementsByTagName("head")[0];
            var script = document.createElement("script");
            script.type = "text/javascript";
            script.onload = function () {
                // we use https://github.com/Ranks/emojify.js as a standard
                Helpers.emojilib = window[lib];
                if (Helpers.emojilib) {
                    Helpers.emojilib.setConfig({
                        img_dir: "https://cdnjs.cloudflare.com/ajax/libs/emojify.js/1.1.0/images/basic/",
                    });
                }
            };
            script.setAttribute("src", scriptSrc);
            head.appendChild(script);
        };
        Helpers.emojify = function (str) {
            if (Helpers.emojilib) {
                str = Helpers.emojilib.replace(str);
            }
            return str;
        };
        Helpers.setTransform = function (el, transformString) {
            el.style["-webkit-transform"] = transformString;
            el.style["-moz-transform"] = transformString;
            el.style["-ms-transform"] = transformString;
            el.style["transform"] = transformString;
        };
        return Helpers;
    }());
    Helpers.caniuse = {
        fileReader: function () {
            if (window.File && window.FileReader && window.FileList && window.Blob)
                return true;
            return false;
        }
    };
    Helpers.emojilib = null;
    cf.Helpers = Helpers;
})(cf || (cf = {}));

// namespace
var cf;
(function (cf) {
    // class
    var BasicElement = (function () {
        function BasicElement(options) {
            this.setData(options);
            this.createElement();
        }
        BasicElement.prototype.setData = function (options) {
        };
        BasicElement.prototype.createElement = function () {
            var template = document.createElement('template');
            template.innerHTML = this.getTemplate();
            this.el = template.firstChild || template.content.firstChild;
            return this.el;
        };
        // template, should be overwritten ...
        BasicElement.prototype.getTemplate = function () { return "should be overwritten..."; };
        ;
        BasicElement.prototype.dealloc = function () {
            this.el.parentNode.removeChild(this.el);
        };
        return BasicElement;
    }());
    cf.BasicElement = BasicElement;
})(cf || (cf = {}));

/// <reference path="../../ConversationalForm.ts"/>
/// <reference path="../BasicElement.ts"/>
/// <reference path="../../form-tags/Tag.ts"/>
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
// namespace
var cf;
(function (cf) {
    cf.ControlElementEvents = {
        SUBMIT_VALUE: "cf-basic-element-submit",
        PROGRESS_CHANGE: "cf-basic-element-progress",
        ON_FOCUS: "cf-basic-element-on-focus",
        ON_LOADED: "cf-basic-element-on-loaded",
    };
    cf.ControlElementProgressStates = {
        BUSY: "cf-control-element-progress-BUSY",
        READY: "cf-control-element-progress-READY",
    };
    // class
    var ControlElement = (function (_super) {
        __extends(ControlElement, _super);
        function ControlElement(options) {
            var _this = _super.call(this, options) || this;
            _this.animateInTimer = 0;
            _this._focus = false;
            _this.onFocusCallback = _this.onFocus.bind(_this);
            _this.el.addEventListener('focus', _this.onFocusCallback, false);
            _this.onBlurCallback = _this.onBlur.bind(_this);
            _this.el.addEventListener('blur', _this.onBlurCallback, false);
            return _this;
        }
        Object.defineProperty(ControlElement.prototype, "type", {
            get: function () {
                return "ControlElement";
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(ControlElement.prototype, "value", {
            get: function () {
                return cf.Helpers.getInnerTextOfElement(this.el);
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(ControlElement.prototype, "positionVector", {
            get: function () {
                return this._positionVector;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(ControlElement.prototype, "tabIndex", {
            set: function (value) {
                this.el.tabIndex = value;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(ControlElement.prototype, "focus", {
            get: function () {
                return this._focus;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(ControlElement.prototype, "visible", {
            get: function () {
                return !this.el.classList.contains("hide");
            },
            set: function (value) {
                if (value) {
                    this.el.classList.remove("hide");
                }
                else {
                    this.el.classList.add("hide");
                    this.tabIndex = -1;
                }
            },
            enumerable: true,
            configurable: true
        });
        ControlElement.prototype.onBlur = function (event) {
            this._focus = false;
        };
        ControlElement.prototype.onFocus = function (event) {
            this._focus = true;
            cf.ConversationalForm.illustrateFlow(this, "dispatch", cf.ControlElementEvents.ON_FOCUS, this.referenceTag);
            document.dispatchEvent(new CustomEvent(cf.ControlElementEvents.ON_FOCUS, {
                detail: this.positionVector
            }));
        };
        /**
        * @name hasImage
        * if control element contains an image element
        */
        ControlElement.prototype.hasImage = function () {
            return false;
        };
        ControlElement.prototype.calcPosition = function () {
            var mr = parseInt(window.getComputedStyle(this.el).getPropertyValue("margin-right"), 10);
            // try not to do this to often, re-paint whammy!
            this._positionVector = {
                height: this.el.offsetHeight,
                width: this.el.offsetWidth + mr,
                x: this.el.offsetLeft,
                y: this.el.offsetTop,
                el: this,
            };
            this._positionVector.centerX = this._positionVector.x + (this._positionVector.width * 0.5);
            this._positionVector.centerY = this._positionVector.y + (this._positionVector.height * 0.5);
        };
        ControlElement.prototype.setData = function (options) {
            this.referenceTag = options.referenceTag;
            _super.prototype.setData.call(this, options);
        };
        ControlElement.prototype.animateIn = function () {
            clearTimeout(this.animateInTimer);
            this.el.classList.add("animate-in");
        };
        ControlElement.prototype.animateOut = function () {
            this.el.classList.add("animate-out");
        };
        ControlElement.prototype.onChoose = function () {
            cf.ConversationalForm.illustrateFlow(this, "dispatch", cf.ControlElementEvents.SUBMIT_VALUE, this.referenceTag);
            document.dispatchEvent(new CustomEvent(cf.ControlElementEvents.SUBMIT_VALUE, {
                detail: this
            }));
        };
        ControlElement.prototype.dealloc = function () {
            this.el.removeEventListener('blur', this.onBlurCallback, false);
            this.onBlurCallback = null;
            this.el.removeEventListener('focus', this.onFocusCallback, false);
            this.onFocusCallback = null;
            _super.prototype.dealloc.call(this);
        };
        return ControlElement;
    }(cf.BasicElement));
    cf.ControlElement = ControlElement;
})(cf || (cf = {}));

/// <reference path="Button.ts"/>
/// <reference path="ControlElement.ts"/>
/// <reference path="RadioButton.ts"/>
/// <reference path="CheckboxButton.ts"/>
/// <reference path="OptionsList.ts"/>
/// <reference path="UploadFileUI.ts"/>
/// <reference path="../ScrollController.ts"/>
/// <reference path="../chat/ChatResponse.ts"/>
/// <reference path="../../../typings/globals/es6-promise/index.d.ts"/>
// namespace
var cf;
(function (cf) {
    var ControlElements = (function () {
        function ControlElements(options) {
            this.ignoreKeyboardInput = false;
            this.rowIndex = -1;
            this.columnIndex = 0;
            this.elementWidth = 0;
            this.filterListNumberOfVisible = 0;
            this.listWidth = 0;
            this.el = options.el;
            this.list = this.el.getElementsByTagName("cf-list")[0];
            this.infoElement = this.el.getElementsByTagName("cf-info")[0];
            this.onScrollCallback = this.onScroll.bind(this);
            this.el.addEventListener('scroll', this.onScrollCallback, false);
            this.onElementFocusCallback = this.onElementFocus.bind(this);
            document.addEventListener(cf.ControlElementEvents.ON_FOCUS, this.onElementFocusCallback, false);
            this.onElementLoadedCallback = this.onElementLoaded.bind(this);
            document.addEventListener(cf.ControlElementEvents.ON_LOADED, this.onElementLoadedCallback, false);
            this.onChatRobotReponseCallback = this.onChatRobotReponse.bind(this);
            document.addEventListener(cf.ChatResponseEvents.ROBOT_QUESTION_ASKED, this.onChatRobotReponseCallback, false);
            this.onUserInputKeyChangeCallback = this.onUserInputKeyChange.bind(this);
            document.addEventListener(cf.UserInputEvents.KEY_CHANGE, this.onUserInputKeyChangeCallback, false);
            // user input update
            this.userInputUpdateCallback = this.onUserInputUpdate.bind(this);
            document.addEventListener(cf.FlowEvents.USER_INPUT_UPDATE, this.userInputUpdateCallback, false);
            this.listScrollController = new cf.ScrollController({
                interactionListener: this.el,
                listToScroll: this.list,
                listNavButtons: this.el.getElementsByTagName("cf-list-button"),
            });
        }
        Object.defineProperty(ControlElements.prototype, "active", {
            get: function () {
                return this.elements && this.elements.length > 0;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(ControlElements.prototype, "focus", {
            get: function () {
                if (!this.elements)
                    return false;
                var elements = this.getElements();
                for (var i = 0; i < elements.length; i++) {
                    var element = elements[i];
                    if (element.focus) {
                        return true;
                    }
                }
                return false;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(ControlElements.prototype, "disabled", {
            set: function (value) {
                if (value)
                    this.list.classList.add("disabled");
                else
                    this.list.classList.remove("disabled");
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(ControlElements.prototype, "length", {
            get: function () {
                var elements = this.getElements();
                return elements.length;
            },
            enumerable: true,
            configurable: true
        });
        ControlElements.prototype.onScroll = function (event) {
            // some times the tabbing will result in el scroll, reset this.
            this.el.scrollLeft = 0;
        };
        /**
        * @name onElementLoaded
        * when element is loaded, usally image loaded.
        */
        ControlElements.prototype.onElementLoaded = function (event) {
            this.resize();
        };
        ControlElements.prototype.onElementFocus = function (event) {
            var vector = event.detail;
            var x = (vector.x + vector.width < this.elementWidth ? 0 : vector.x - vector.width);
            x *= -1;
            this.updateRowColIndexFromVector(vector);
            this.listScrollController.setScroll(x, 0);
        };
        ControlElements.prototype.updateRowColIndexFromVector = function (vector) {
            for (var i = 0; i < this.tableableRows.length; i++) {
                var items = this.tableableRows[i];
                for (var j = 0; j < items.length; j++) {
                    var item = items[j];
                    if (item == vector.el) {
                        this.rowIndex = i;
                        this.columnIndex = j;
                        break;
                    }
                }
            }
        };
        ControlElements.prototype.onChatRobotReponse = function (event) {
            this.animateElementsIn();
        };
        ControlElements.prototype.onUserInputKeyChange = function (event) {
            if (this.ignoreKeyboardInput) {
                this.ignoreKeyboardInput = false;
                return;
            }
            var dto = event.detail;
            var userInput = dto.dto.input;
            if (this.active) {
                var shouldFilter = dto.inputFieldActive;
                if (shouldFilter) {
                    // input field is active, so we should filter..
                    var dto_1 = event.detail.dto;
                    var inputValue = dto_1.input.getInputValue();
                    this.filterElementsFrom(inputValue);
                }
                else {
                    if (dto.keyCode == cf.Dictionary.keyCodes["left"]) {
                        this.columnIndex--;
                    }
                    else if (dto.keyCode == cf.Dictionary.keyCodes["right"]) {
                        this.columnIndex++;
                    }
                    else if (dto.keyCode == cf.Dictionary.keyCodes["down"]) {
                        this.updateRowIndex(1);
                    }
                    else if (dto.keyCode == cf.Dictionary.keyCodes["up"]) {
                        this.updateRowIndex(-1);
                    }
                    else if (dto.keyCode == cf.Dictionary.keyCodes["enter"] || dto.keyCode == cf.Dictionary.keyCodes["space"]) {
                        if (this.tableableRows[this.rowIndex] && this.tableableRows[this.rowIndex][this.columnIndex]) {
                            this.tableableRows[this.rowIndex][this.columnIndex].el.click();
                        }
                        else if (this.tableableRows[0] && this.tableableRows[0].length == 1) {
                            // this is when only one element in a filter, then we click it!
                            this.tableableRows[0][0].el.click();
                        }
                    }
                    if (!this.validateRowColIndexes()) {
                        userInput.setFocusOnInput();
                    }
                }
            }
            if (!userInput.active && this.validateRowColIndexes() && this.tableableRows && (this.rowIndex == 0 || this.rowIndex == 1)) {
                this.tableableRows[this.rowIndex][this.columnIndex].el.focus();
            }
            else if (!userInput.active) {
                userInput.setFocusOnInput();
            }
        };
        ControlElements.prototype.validateRowColIndexes = function () {
            var maxRowIndex = (this.el.classList.contains("two-row") ? 1 : 0);
            if (this.rowIndex != -1 && this.tableableRows[this.rowIndex]) {
                // columnIndex is only valid if rowIndex is valid
                if (this.columnIndex < 0) {
                    this.columnIndex = this.tableableRows[this.rowIndex].length - 1;
                }
                if (this.columnIndex > this.tableableRows[this.rowIndex].length - 1) {
                    this.columnIndex = 0;
                }
                return true;
            }
            else {
                this.resetTabList();
                return false;
            }
        };
        ControlElements.prototype.updateRowIndex = function (direction) {
            var oldRowIndex = this.rowIndex;
            this.rowIndex += direction;
            if (this.tableableRows[this.rowIndex]) {
                // when row index is changed we need to find the closest column element, we cannot expect them to be indexly aligned
                var oldVector = this.tableableRows[oldRowIndex][this.columnIndex].positionVector;
                var items = this.tableableRows[this.rowIndex];
                var currentDistance = 10000000000000;
                for (var i = 0; i < items.length; i++) {
                    var element = items[i];
                    if (currentDistance > Math.abs(oldVector.centerX - element.positionVector.centerX)) {
                        currentDistance = Math.abs(oldVector.centerX - element.positionVector.centerX);
                        this.columnIndex = i;
                    }
                }
            }
        };
        ControlElements.prototype.resetTabList = function () {
            this.rowIndex = -1;
            this.columnIndex = -1;
        };
        ControlElements.prototype.onUserInputUpdate = function (event) {
            this.el.classList.remove("animate-in");
            this.infoElement.classList.remove("show");
            if (this.elements) {
                var elements = this.getElements();
                for (var i = 0; i < elements.length; i++) {
                    var element = elements[i];
                    element.animateOut();
                }
            }
        };
        ControlElements.prototype.filterElementsFrom = function (value) {
            var inputValuesLowerCase = value.toLowerCase().split(" ");
            if (inputValuesLowerCase.indexOf("") != -1)
                inputValuesLowerCase.splice(inputValuesLowerCase.indexOf(""), 1);
            var elements = this.getElements();
            if (elements.length > 1) {
                // the type is not strong with this one..
                var itemsVisible = [];
                for (var i = 0; i < elements.length; i++) {
                    var element = elements[i];
                    var elementVisibility = true;
                    // check for all words of input
                    for (var i_1 = 0; i_1 < inputValuesLowerCase.length; i_1++) {
                        var inputWord = inputValuesLowerCase[i_1];
                        if (elementVisibility) {
                            elementVisibility = element.value.toLowerCase().indexOf(inputWord) != -1;
                        }
                    }
                    // set element visibility.
                    element.visible = elementVisibility;
                    if (elementVisibility && element.visible)
                        itemsVisible.push(element);
                }
                // set feedback text for filter..
                this.infoElement.innerHTML = itemsVisible.length == 0 ? cf.Dictionary.get("input-no-filter").split("{input-value}").join(value) : "";
                if (itemsVisible.length == 0) {
                    this.infoElement.classList.add("show");
                }
                else {
                    this.infoElement.classList.remove("show");
                }
                // crude way of checking if list has changed...
                var hasListChanged = this.filterListNumberOfVisible != itemsVisible.length;
                if (hasListChanged) {
                    this.resize();
                    this.animateElementsIn();
                }
                this.filterListNumberOfVisible = itemsVisible.length;
            }
        };
        ControlElements.prototype.animateElementsIn = function () {
            if (this.elements) {
                var elements = this.getElements();
                if (elements.length > 0) {
                    if (!this.el.classList.contains("animate-in"))
                        this.el.classList.add("animate-in");
                    for (var i = 0; i < elements.length; i++) {
                        var element = elements[i];
                        element.animateIn();
                    }
                }
            }
        };
        ControlElements.prototype.getElements = function () {
            if (this.elements.length > 0 && this.elements[0].type == "OptionsList")
                return this.elements[0].elements;
            return this.elements;
        };
        /**
        * @name buildTabableRows
        * build the tabable array index
        */
        ControlElements.prototype.buildTabableRows = function () {
            this.tableableRows = [];
            this.resetTabList();
            var elements = this.getElements();
            if (this.el.classList.contains("two-row")) {
                // two rows
                this.tableableRows[0] = [];
                this.tableableRows[1] = [];
                for (var i = 0; i < elements.length; i++) {
                    var element = elements[i];
                    if (element.visible) {
                        // crude way of checking if element is top row or bottom row..
                        if (element.positionVector.y < 30)
                            this.tableableRows[0].push(element);
                        else
                            this.tableableRows[1].push(element);
                    }
                }
            }
            else {
                // single row
                this.tableableRows[0] = [];
                for (var i = 0; i < elements.length; i++) {
                    var element = elements[i];
                    if (element.visible)
                        this.tableableRows[0].push(element);
                }
            }
        };
        ControlElements.prototype.resetAfterErrorMessage = function () {
            if (this.currentControlElement) {
                //reverse value of currentControlElement.
                this.currentControlElement.checked = !this.currentControlElement.checked;
                this.currentControlElement = null;
            }
            this.disabled = false;
        };
        ControlElements.prototype.focusFrom = function (angle) {
            if (!this.tableableRows)
                return;
            this.columnIndex = 0;
            if (angle == "bottom") {
                this.rowIndex = this.el.classList.contains("two-row") ? 1 : 0;
            }
            else if (angle == "top") {
                this.rowIndex = 0;
            }
            if (this.tableableRows[this.rowIndex] && this.tableableRows[this.rowIndex][this.columnIndex]) {
                this.ignoreKeyboardInput = true;
                this.tableableRows[this.rowIndex][this.columnIndex].el.focus();
            }
            else {
                this.resetTabList();
            }
        };
        ControlElements.prototype.updateStateOnElements = function (controlElement) {
            this.disabled = true;
            this.currentControlElement = controlElement;
            if (controlElement.type == "RadioButton") {
                // uncheck other radio buttons...
                var elements = this.getElements();
                for (var i = 0; i < elements.length; i++) {
                    var element = elements[i];
                    if (element != controlElement) {
                        element.checked = false;
                    }
                }
            }
        };
        ControlElements.prototype.reset = function () {
            this.el.classList.remove("one-row");
            this.el.classList.remove("two-row");
        };
        ControlElements.prototype.getElement = function (index) {
            return this.elements[index];
        };
        ControlElements.prototype.getDTO = function () {
            var dto = {
                text: undefined,
                controlElements: [],
            };
            // generate text value for ChatReponse
            if (this.elements && this.elements.length > 0) {
                switch (this.elements[0].type) {
                    case "CheckboxButton":
                        var values = [];
                        for (var i = 0; i < this.elements.length; i++) {
                            var element_1 = this.elements[i];
                            if (element_1.checked) {
                                values.push(element_1.value);
                            }
                            dto.controlElements.push(element_1);
                        }
                        dto.text = cf.Dictionary.parseAndGetMultiValueString(values);
                        break;
                    case "RadioButton":
                        for (var i = 0; i < this.elements.length; i++) {
                            var element_2 = this.elements[i];
                            if (element_2.checked) {
                                dto.text = element_2.value;
                            }
                            dto.controlElements.push(element_2);
                        }
                        break;
                    case "OptionsList":
                        var element = this.elements[0];
                        dto.controlElements = element.getValue();
                        var values = [];
                        if (dto.controlElements && dto.controlElements[0]) {
                            for (var i_2 = 0; i_2 < dto.controlElements.length; i_2++) {
                                var element_3 = dto.controlElements[i_2];
                                values.push(dto.controlElements[i_2].value);
                            }
                        }
                        // after value is created then set to all elements
                        dto.controlElements = element.elements;
                        dto.text = cf.Dictionary.parseAndGetMultiValueString(values);
                        break;
                    case "UploadFileUI":
                        dto.text = this.elements[0].fileName; //Dictionary.parseAndGetMultiValueString(values);
                        dto.controlElements.push(this.elements[0]);
                        break;
                }
            }
            return dto;
        };
        ControlElements.prototype.buildTags = function (tags) {
            var _this = this;
            this.disabled = false;
            var topList = this.el.parentNode.getElementsByTagName("ul")[0];
            var bottomList = this.el.parentNode.getElementsByTagName("ul")[1];
            // remove old elements
            if (this.elements) {
                while (this.elements.length > 0) {
                    this.elements.pop().dealloc();
                }
            }
            this.elements = [];
            for (var i = 0; i < tags.length; i++) {
                var tag = tags[i];
                switch (tag.type) {
                    case "radio":
                        this.elements.push(new cf.RadioButton({
                            referenceTag: tag
                        }));
                        break;
                    case "checkbox":
                        this.elements.push(new cf.CheckboxButton({
                            referenceTag: tag
                        }));
                        break;
                    case "select":
                        this.elements.push(new cf.OptionsList({
                            referenceTag: tag,
                            context: this.list,
                        }));
                        break;
                    case "input":
                    default:
                        if (tag.type == "file") {
                            this.elements.push(new cf.UploadFileUI({
                                referenceTag: tag,
                            }));
                        }
                        // nothing to add.
                        // console.log("UserInput buildControlElements:", "none Control UI type, only input field is needed.");
                        break;
                }
                if (tag.type != "select" && this.elements.length > 0) {
                    var element = this.elements[this.elements.length - 1];
                    this.list.appendChild(element.el);
                }
            }
            var isElementsOptionsList = this.elements[0] && this.elements[0].type == "OptionsList";
            if (isElementsOptionsList) {
                this.filterListNumberOfVisible = this.elements[0].elements.length;
            }
            else {
                this.filterListNumberOfVisible = tags.length;
            }
            new Promise(function (resolve, reject) { return _this.resize(resolve, reject); }).then(function () {
                var h = _this.el.classList.contains("one-row") ? 52 : _this.el.classList.contains("two-row") ? 102 : 0;
                var controlElementsAddedDTO = {
                    height: h,
                };
                cf.ConversationalForm.illustrateFlow(_this, "dispatch", cf.UserInputEvents.CONTROL_ELEMENTS_ADDED, controlElementsAddedDTO);
                document.dispatchEvent(new CustomEvent(cf.UserInputEvents.CONTROL_ELEMENTS_ADDED, {
                    detail: controlElementsAddedDTO
                }));
            });
        };
        ControlElements.prototype.resize = function (resolve, reject) {
            var _this = this;
            // scrollbar things
            // Element.offsetWidth - Element.clientWidth
            this.list.style.width = "100%";
            this.el.classList.remove("resized");
            this.el.classList.remove("one-row");
            this.el.classList.remove("two-row");
            this.elementWidth = 0;
            setTimeout(function () {
                _this.listWidth = 0;
                var elements = _this.getElements();
                if (elements.length > 0) {
                    var listWidthValues = [];
                    var listWidthValues2 = [];
                    var containsElementWithImage = false;
                    for (var i = 0; i < elements.length; i++) {
                        var element = elements[i];
                        if (element.visible) {
                            element.calcPosition();
                            _this.listWidth += element.positionVector.width;
                            listWidthValues.push(element.positionVector.x + element.positionVector.width);
                            listWidthValues2.push(element);
                        }
                        if (element.hasImage())
                            containsElementWithImage = true;
                    }
                    var elOffsetWidth_1 = _this.el.offsetWidth;
                    var isListWidthOverElementWidth_1 = _this.listWidth > elOffsetWidth_1;
                    if (isListWidthOverElementWidth_1 && !containsElementWithImage) {
                        _this.el.classList.add("two-row");
                        _this.listWidth = Math.max(elOffsetWidth_1, Math.round((listWidthValues[Math.floor(listWidthValues.length / 2)]) + 50));
                        _this.list.style.width = _this.listWidth + "px";
                    }
                    else {
                        _this.el.classList.add("one-row");
                    }
                    setTimeout(function () {
                        // recalc after LIST classes has been added
                        for (var i = 0; i < elements.length; i++) {
                            var element = elements[i];
                            if (element.visible) {
                                element.calcPosition();
                            }
                        }
                        // check again after classes are set.
                        isListWidthOverElementWidth_1 = _this.listWidth > elOffsetWidth_1;
                        // sort the list so we can set tabIndex properly
                        var elementsCopyForSorting = elements.slice();
                        var tabIndexFilteredElements = elementsCopyForSorting.sort(function (a, b) {
                            var aOverB = a.positionVector.y > b.positionVector.y;
                            return a.positionVector.x == b.positionVector.x ? (aOverB ? 1 : -1) : a.positionVector.x < b.positionVector.x ? -1 : 1;
                        });
                        var tabIndex = 0;
                        for (var i = 0; i < tabIndexFilteredElements.length; i++) {
                            var element = tabIndexFilteredElements[i];
                            if (element.visible) {
                                //tabindex 1 are the UserInput element
                                element.tabIndex = 2 + (tabIndex++);
                            }
                            else {
                                element.tabIndex = -1;
                            }
                        }
                        // toggle nav button visiblity
                        cancelAnimationFrame(_this.rAF);
                        if (isListWidthOverElementWidth_1) {
                            _this.el.classList.remove("hide-nav-buttons");
                        }
                        else {
                            _this.el.classList.add("hide-nav-buttons");
                        }
                        _this.elementWidth = elOffsetWidth_1;
                        // resize scroll
                        _this.listScrollController.resize(_this.listWidth, _this.elementWidth);
                        _this.buildTabableRows();
                        _this.el.classList.add("resized");
                    }, 0);
                }
                if (resolve)
                    resolve();
            }, 0);
        };
        ControlElements.prototype.dealloc = function () {
            this.currentControlElement = null;
            this.tableableRows = null;
            cancelAnimationFrame(this.rAF);
            this.rAF = null;
            this.el.removeEventListener('scroll', this.onScrollCallback, false);
            this.onScrollCallback = null;
            document.removeEventListener(cf.ControlElementEvents.ON_FOCUS, this.onElementFocusCallback, false);
            this.onElementFocusCallback = null;
            document.removeEventListener(cf.ChatResponseEvents.ROBOT_QUESTION_ASKED, this.onChatRobotReponseCallback, false);
            this.onChatRobotReponseCallback = null;
            document.removeEventListener(cf.UserInputEvents.KEY_CHANGE, this.onUserInputKeyChangeCallback, false);
            this.onUserInputKeyChangeCallback = null;
            document.removeEventListener(cf.FlowEvents.USER_INPUT_UPDATE, this.userInputUpdateCallback, false);
            this.userInputUpdateCallback = null;
            document.removeEventListener(cf.ControlElementEvents.ON_LOADED, this.onElementLoadedCallback, false);
            this.onElementLoadedCallback = null;
            this.listScrollController.dealloc();
        };
        return ControlElements;
    }());
    cf.ControlElements = ControlElements;
})(cf || (cf = {}));

/// <reference path="../logic/Helpers.ts"/>
// namespace
var cf;
(function (cf) {
    var ScrollController = (function () {
        function ScrollController(options) {
            this.listWidth = 0;
            this.visibleAreaWidth = 0;
            this.max = 0;
            this.interacting = false;
            this.x = 0;
            this.xTarget = 0;
            this.startX = 0;
            this.startXTarget = 0;
            this.mouseSpeed = 0;
            this.mouseSpeedTarget = 0;
            this.direction = 0;
            this.directionTarget = 0;
            this.inputAccerlation = 0;
            this.inputAccerlationTarget = 0;
            this.interactionListener = options.interactionListener;
            this.listToScroll = options.listToScroll;
            this.prevButton = options.listNavButtons[0];
            this.nextButton = options.listNavButtons[1];
            this.onListNavButtonsClickCallback = this.onListNavButtonsClick.bind(this);
            this.prevButton.addEventListener("click", this.onListNavButtonsClickCallback, false);
            this.nextButton.addEventListener("click", this.onListNavButtonsClickCallback, false);
            this.documentLeaveCallback = this.documentLeave.bind(this);
            this.onInteractStartCallback = this.onInteractStart.bind(this);
            this.onInteractEndCallback = this.onInteractEnd.bind(this);
            this.onInteractMoveCallback = this.onInteractMove.bind(this);
            document.addEventListener("mouseleave", this.documentLeaveCallback, false);
            document.addEventListener(cf.Helpers.getMouseEvent("mouseup"), this.documentLeaveCallback, false);
            this.interactionListener.addEventListener(cf.Helpers.getMouseEvent("mousedown"), this.onInteractStartCallback, false);
            this.interactionListener.addEventListener(cf.Helpers.getMouseEvent("mouseup"), this.onInteractEndCallback, false);
            this.interactionListener.addEventListener(cf.Helpers.getMouseEvent("mousemove"), this.onInteractMoveCallback, false);
        }
        ScrollController.prototype.onListNavButtonsClick = function (event) {
            var dirClick = event.currentTarget.getAttribute("direction");
            this.pushDirection(dirClick == "next" ? -1 : 1);
        };
        ScrollController.prototype.documentLeave = function (event) {
            this.onInteractEnd(event);
        };
        ScrollController.prototype.onInteractStart = function (event) {
            var vector = cf.Helpers.getXYFromMouseTouchEvent(event);
            this.interacting = true;
            this.startX = vector.x;
            this.startXTarget = this.startX;
            this.inputAccerlation = 0;
            this.render();
        };
        ScrollController.prototype.onInteractEnd = function (event) {
            this.interacting = false;
        };
        ScrollController.prototype.onInteractMove = function (event) {
            if (this.interacting) {
                var vector = cf.Helpers.getXYFromMouseTouchEvent(event);
                var newAcc = vector.x - this.startX;
                var magnifier = 6.2;
                this.inputAccerlationTarget = newAcc * magnifier;
                this.directionTarget = this.inputAccerlationTarget < 0 ? -1 : 1;
                this.startXTarget = vector.x;
            }
        };
        ScrollController.prototype.render = function () {
            var _this = this;
            if (this.rAF)
                cancelAnimationFrame(this.rAF);
            // normalise startX
            this.startX += (this.startXTarget - this.startX) * 0.2;
            // animate accerlaration
            this.inputAccerlation += (this.inputAccerlationTarget - this.inputAccerlation) * (this.interacting ? Math.min(ScrollController.accerlation + 0.1, 1) : ScrollController.accerlation);
            var accDamping = 0.25;
            this.inputAccerlationTarget *= accDamping;
            // animate directions
            this.direction += (this.directionTarget - this.direction) * 0.2;
            // extra extra
            this.mouseSpeed += (this.mouseSpeedTarget - this.mouseSpeed) * 0.2;
            this.direction += this.mouseSpeed;
            // animate x
            this.xTarget += this.inputAccerlation * 0.05;
            // bounce back when over
            if (this.xTarget > 0)
                this.xTarget += (0 - this.xTarget) * cf.Helpers.lerp(ScrollController.accerlation, 0.3, 0.8);
            if (this.xTarget < this.max)
                this.xTarget += (this.max - this.xTarget) * cf.Helpers.lerp(ScrollController.accerlation, 0.3, 0.8);
            this.x += (this.xTarget - this.x) * 0.4;
            // toggle visibility on nav arrows
            var xRounded = Math.round(this.x);
            if (xRounded < 0) {
                if (!this.prevButton.classList.contains("active"))
                    this.prevButton.classList.add("active");
                if (!this.prevButton.classList.contains("cf-gradient"))
                    this.prevButton.classList.add("cf-gradient");
            }
            if (xRounded == 0) {
                if (this.prevButton.classList.contains("active"))
                    this.prevButton.classList.remove("active");
                if (this.prevButton.classList.contains("cf-gradient"))
                    this.prevButton.classList.remove("cf-gradient");
            }
            if (xRounded > this.max) {
                if (!this.nextButton.classList.contains("active"))
                    this.nextButton.classList.add("active");
                if (!this.nextButton.classList.contains("cf-gradient"))
                    this.nextButton.classList.add("cf-gradient");
            }
            if (xRounded <= this.max) {
                if (!this.nextButton.classList.contains("active"))
                    this.nextButton.classList.remove("active");
                if (!this.nextButton.classList.contains("cf-gradient"))
                    this.nextButton.classList.remove("cf-gradient");
            }
            // set css transforms
            var xx = this.x;
            cf.Helpers.setTransform(this.listToScroll, "translateX(" + xx + "px)");
            // cycle render
            if (this.interacting || (Math.abs(this.x - this.xTarget) > 0.02 && !this.interacting))
                this.rAF = window.requestAnimationFrame(function () { return _this.render(); });
        };
        ScrollController.prototype.setScroll = function (x, y) {
            this.xTarget = this.visibleAreaWidth == this.listWidth ? 0 : x;
            this.render();
        };
        ScrollController.prototype.pushDirection = function (dir) {
            this.inputAccerlationTarget += (5000) * dir;
            this.render();
        };
        ScrollController.prototype.dealloc = function () {
            this.prevButton.removeEventListener("click", this.onListNavButtonsClickCallback, false);
            this.nextButton.removeEventListener("click", this.onListNavButtonsClickCallback, false);
            this.onListNavButtonsClickCallback = null;
            this.prevButton = null;
            this.nextButton = null;
            document.removeEventListener("mouseleave", this.documentLeaveCallback, false);
            this.interactionListener.removeEventListener(cf.Helpers.getMouseEvent("mousedown"), this.onInteractStartCallback, false);
            this.interactionListener.removeEventListener(cf.Helpers.getMouseEvent("mouseup"), this.onInteractEndCallback, false);
            this.interactionListener.removeEventListener(cf.Helpers.getMouseEvent("mousemove"), this.onInteractMoveCallback, false);
            this.documentLeaveCallback = null;
            this.onInteractStartCallback = null;
            this.onInteractEndCallback = null;
            this.onInteractMoveCallback = null;
        };
        ScrollController.prototype.reset = function () {
            this.interacting = false;
            this.startX = 0;
            this.startXTarget = this.startX;
            this.inputAccerlation = 0;
            this.x = 0;
            this.xTarget = 0;
            this.render();
            this.prevButton.classList.remove("active");
            this.nextButton.classList.remove("active");
        };
        ScrollController.prototype.resize = function (listWidth, visibleAreaWidth) {
            this.reset();
            this.visibleAreaWidth = visibleAreaWidth;
            this.listWidth = Math.max(visibleAreaWidth, listWidth);
            this.max = (this.listWidth - this.visibleAreaWidth) * -1;
            this.render();
        };
        return ScrollController;
    }());
    ScrollController.accerlation = 0.1;
    cf.ScrollController = ScrollController;
})(cf || (cf = {}));

// namespace
var cf;
(function (cf) {
    // class
    var Dictionary = (function () {
        function Dictionary(options) {
            // can be overwritten
            this.data = {
                "user-image": "data:image/png;charset=utf-8;base64,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",
                "entry-not-found": "Dictionary item not found.",
                "input-placeholder": "Type your answer here ...",
                "group-placeholder": "Type to filter list ...",
                "input-placeholder-error": "Your input is not correct ...",
                "input-placeholder-required": "Input is required ...",
                "input-placeholder-file-error": "File upload failed ...",
                "input-placeholder-file-size-error": "File size too big ...",
                "input-no-filter": "No results found for <strong>{input-value}</strong>",
                "user-reponse-and": " and ",
                "user-reponse-missing": "Missing input ...",
                "user-reponse-missing-group": "Nothing selected ...",
                "general": "General type1|General type2",
                "icon-type-file": "<svg class='cf-icon-file' viewBox='0 0 10 14' version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'><g stroke='none' stroke-width='1' fill='none' fill-rule='evenodd'><g transform='translate(-756.000000, -549.000000)' fill='#0D83FF'><g transform='translate(736.000000, 127.000000)'><g transform='translate(0.000000, 406.000000)'><polygon points='20 16 26.0030799 16 30 19.99994 30 30 20 30'></polygon></g></g></g></g></svg>",
            };
            // can be overwriten
            this.robotData = {
                "robot-image": "data:image/png;charset=utf-8;base64,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",
                "input": "Please write some text.",
                "text": "Please write some text.",
                "checkbox": "Select as many as you want.",
                "name": "What's your name?",
                "email": "Need your e-mail.",
                "password": "Please provide password",
                "tel": "What's your phone number?",
                "radio": "I need you to select one of these.",
                "select": "Choose any of these options.",
                "general": "General1|General2|General3.."
            };
            Dictionary.instance = this;
            // overwrite data if defined 
            if (options && options.data)
                this.data = this.validateAndSetNewData(options.data, this.data);
            // overwrite user image
            if (options.userImage)
                this.data["user-image"] = options.userImage;
            // overwrite robot image
            if (options.robotImage)
                this.robotData["robot-image"] = options.robotImage;
            // overwrite robot questions if defined
            if (options && options.robotData)
                this.robotData = this.validateAndSetNewData(options.robotData, this.robotData);
        }
        Dictionary.get = function (id) {
            var ins = Dictionary.instance;
            var value = ins.data[id];
            if (!value) {
                value = ins.data["entry-not-found"];
            }
            else {
                var values = value.split("|");
                value = values[Math.floor(Math.random() * values.length)];
            }
            return value;
        };
        /**
        * @name set
        * set a dictionary value
        *	id: string, id of the value to update
        *	type: string, "human" || "robot"
        *	value: string, value to be inserted
        */
        Dictionary.set = function (id, type, value) {
            var ins = Dictionary.instance;
            var obj = type == "robot" ? ins.robotData : ins.data;
            obj[id] = value;
            return obj[id];
        };
        Dictionary.getRobotResponse = function (tagType) {
            var ins = Dictionary.instance;
            var value = ins.robotData[tagType];
            if (!value) {
                // value not found, so pick a general one
                var generals = ins.robotData["general"].split("|");
                value = generals[Math.floor(Math.random() * generals.length)];
            }
            else {
                var values = value.split("|");
                value = values[Math.floor(Math.random() * values.length)];
            }
            return value;
        };
        Dictionary.parseAndGetMultiValueString = function (arr) {
            var value = "";
            for (var i = 0; i < arr.length; i++) {
                var str = arr[i];
                var sym = (arr.length > 1 && i == arr.length - 2 ? Dictionary.get("user-reponse-and") : ", ");
                value += str + (i < arr.length - 1 ? sym : "");
            }
            return value;
        };
        Dictionary.prototype.validateAndSetNewData = function (newData, originalDataObject) {
            for (var key in originalDataObject) {
                if (!newData[key]) {
                    console.warn("Conversational Form Dictionary warning, '" + key + "' value is undefined, mapping '" + key + "' to default value. See Dictionary.ts for keys.");
                    newData[key] = originalDataObject[key];
                }
            }
            return newData;
        };
        return Dictionary;
    }());
    Dictionary.keyCodes = {
        "left": 37,
        "right": 39,
        "down": 40,
        "up": 38,
        "enter": 13,
        "space": 32,
        "shift": 16,
        "tab": 9,
    };
    cf.Dictionary = Dictionary;
})(cf || (cf = {}));

/// <reference path="../data/Dictionary.ts"/>
/// <reference path="InputTag.ts"/>
/// <reference path="ButtonTag.ts"/>
/// <reference path="SelectTag.ts"/>
/// <reference path="OptionTag.ts"/>
/// <reference path="../ConversationalForm.ts"/>
// basic tag from form logic
// types:
// radio
// text
// email
// tel
// password
// checkbox
// radio
// select
// button
// namespace
var cf;
(function (cf) {
    // class
    var Tag = (function () {
        function Tag(options) {
            this.domElement = options.domElement;
            // remove tabIndex from the dom element.. danger zone... should we or should we not...
            this.domElement.tabIndex = -1;
            // questions array
            if (options.questions)
                this.questions = options.questions;
            // custom tag validation
            if (this.domElement.getAttribute("cf-validation")) {
                // set it through an attribute, danger land with eval
                this.validationCallback = eval(this.domElement.getAttribute("cf-validation"));
            }
            // reg ex pattern is set on the Tag, so use it in our validation
            if (this.domElement.getAttribute("pattern"))
                this.pattern = new RegExp(this.domElement.getAttribute("pattern"));
            // if(this.type == "email" && !this.pattern){
            // 	// set a standard e-mail pattern for email type input
            // 	this.pattern = new RegExp("^[^@]+@[^@]+\.[^@]+$");
            // }
            if (this.type != "group") {
                console.log('Tag registered:', this.type);
            }
            this.refresh();
        }
        Object.defineProperty(Tag.prototype, "type", {
            get: function () {
                return this.domElement.getAttribute("type") || this.domElement.tagName.toLowerCase();
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(Tag.prototype, "name", {
            get: function () {
                return this.domElement.getAttribute("name");
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(Tag.prototype, "inputPlaceholder", {
            get: function () {
                return this._inputPlaceholder;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(Tag.prototype, "label", {
            get: function () {
                if (!this._label)
                    this.findAndSetLabel();
                if (this._label)
                    return this._label;
                return cf.Dictionary.getRobotResponse(this.type);
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(Tag.prototype, "value", {
            get: function () {
                return this.domElement.value;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(Tag.prototype, "disabled", {
            get: function () {
                return this.domElement.getAttribute("disabled") != undefined && this.domElement.getAttribute("disabled") != null;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(Tag.prototype, "required", {
            get: function () {
                return !!this.domElement.getAttribute("required") || this.domElement.getAttribute("required") == "";
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(Tag.prototype, "question", {
            get: function () {
                // if questions are empty, then fall back to dictionary, every time
                if (!this.questions || this.questions.length == 0)
                    return cf.Dictionary.getRobotResponse(this.type);
                else
                    return this.questions[Math.floor(Math.random() * this.questions.length)];
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(Tag.prototype, "errorMessage", {
            get: function () {
                if (!this.errorMessages) {
                    // custom tag error messages
                    if (this.domElement.getAttribute("cf-error")) {
                        this.errorMessages = this.domElement.getAttribute("cf-error").split("|");
                    }
                    else if (this.domElement.parentNode && this.domElement.parentNode.getAttribute("cf-error")) {
                        this.errorMessages = this.domElement.parentNode.getAttribute("cf-error").split("|");
                    }
                    else if (this.required) {
                        this.errorMessages = [cf.Dictionary.get("input-placeholder-required")];
                    }
                    else {
                        if (this.type == "file")
                            this.errorMessages = [cf.Dictionary.get("input-placeholder-file-error")];
                        else {
                            this.errorMessages = [cf.Dictionary.get("input-placeholder-error")];
                        }
                    }
                }
                return this.errorMessages[Math.floor(Math.random() * this.errorMessages.length)];
            },
            enumerable: true,
            configurable: true
        });
        Tag.prototype.dealloc = function () {
            this.domElement = null;
            this.defaultValue = null;
            this.errorMessages = null;
            this.pattern = null;
            this._label = null;
            this.validationCallback = null;
            this.questions = null;
        };
        Tag.isTagValid = function (element) {
            if (element.getAttribute("type") === "hidden")
                return false;
            if (element.getAttribute("type") === "submit")
                return false;
            // ignore buttons, we submit the form automatially
            if (element.getAttribute("type") == "button")
                return false;
            if (element.style.display === "none")
                return false;
            if (element.style.visibility === "hidden")
                return false;
            var innerText = cf.Helpers.getInnerTextOfElement(element);
            if (element.tagName.toLowerCase() == "option" && (innerText == "" || innerText == " ")) {
                return false;
            }
            if (element.tagName.toLowerCase() == "select" || element.tagName.toLowerCase() == "option")
                return true;
            else {
                return !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
            }
        };
        Tag.createTag = function (element) {
            if (Tag.isTagValid(element)) {
                // ignore hidden tags
                var tag = void 0;
                if (element.tagName.toLowerCase() == "input") {
                    tag = new cf.InputTag({
                        domElement: element
                    });
                }
                else if (element.tagName.toLowerCase() == "textarea") {
                    tag = new cf.InputTag({
                        domElement: element
                    });
                }
                else if (element.tagName.toLowerCase() == "select") {
                    tag = new cf.SelectTag({
                        domElement: element
                    });
                }
                else if (element.tagName.toLowerCase() == "button") {
                    tag = new cf.ButtonTag({
                        domElement: element
                    });
                }
                else if (element.tagName.toLowerCase() == "option") {
                    tag = new cf.OptionTag({
                        domElement: element
                    });
                }
                return tag;
            }
            else {
                // console.warn("Tag is not valid!: "+ element);
                return null;
            }
        };
        Tag.prototype.refresh = function () {
            // default value of Tag, check every refresh
            this.defaultValue = this.domElement.value;
            this.questions = null;
            this.findAndSetQuestions();
        };
        Tag.prototype.setTagValueAndIsValid = function (dto) {
            // this sets the value of the tag in the DOM
            // validation
            var isValid = true;
            var valueText = dto.text;
            if (this.pattern) {
                isValid = this.pattern.test(valueText);
            }
            if (valueText == "" && this.required) {
                isValid = false;
            }
            var min = parseInt(this.domElement.getAttribute("min"), 10) || -1;
            var max = parseInt(this.domElement.getAttribute("max"), 10) || -1;
            if (min != -1 && valueText.length < min) {
                isValid = false;
            }
            if (max != -1 && valueText.length > max) {
                isValid = false;
            }
            if (isValid) {
                // we cannot set the dom element value when type is file
                if (this.type != "file")
                    this.domElement.value = valueText;
            }
            else {
            }
            return isValid;
        };
        Tag.prototype.findAndSetQuestions = function () {
            if (this.questions)
                return;
            // <label tag with label:for attribute to el:id
            // check for label tag, we only go 2 steps backwards..
            // from standardize markup: http://www.w3schools.com/tags/tag_label.asp
            if (this.domElement.getAttribute("cf-questions")) {
                this.questions = this.domElement.getAttribute("cf-questions").split("|");
                if (this.domElement.getAttribute("cf-input-placeholder"))
                    this._inputPlaceholder = this.domElement.getAttribute("cf-input-placeholder");
            }
            else if (this.domElement.parentNode && this.domElement.parentNode.getAttribute("cf-questions")) {
                // for groups the parentNode can have the cf-questions..
                var parent_1 = this.domElement.parentNode;
                this.questions = parent_1.getAttribute("cf-questions").split("|");
                if (parent_1.getAttribute("cf-input-placeholder"))
                    this._inputPlaceholder = parent_1.getAttribute("cf-input-placeholder");
            }
            else {
                // questions not set, so find it in the DOM
                // try a broader search using for and id attributes
                var elId = this.domElement.getAttribute("id");
                var forLabel = document.querySelector("label[for='" + elId + "']");
                if (forLabel) {
                    this.questions = [cf.Helpers.getInnerTextOfElement(forLabel)];
                }
            }
            if (!this.questions && this.domElement.getAttribute("placeholder")) {
                // check for placeholder attr if questions are still undefined
                this.questions = [this.domElement.getAttribute("placeholder")];
            }
        };
        Tag.prototype.findAndSetLabel = function () {
            // find label..
            if (this.domElement.getAttribute("cf-label")) {
                this._label = this.domElement.getAttribute("cf-label");
            }
            else {
                var parentDomNode = this.domElement.parentNode;
                if (parentDomNode) {
                    // step backwards and check for label tag.
                    var labelTags = parentDomNode.getElementsByTagName("label");
                    if (labelTags.length == 0) {
                        // check for innerText
                        var innerText = cf.Helpers.getInnerTextOfElement(parentDomNode);
                        if (innerText && innerText.length > 0)
                            labelTags = [parentDomNode];
                    }
                    if (labelTags.length > 0 && labelTags[0])
                        this._label = cf.Helpers.getInnerTextOfElement(labelTags[0]);
                }
            }
        };
        return Tag;
    }());
    cf.Tag = Tag;
})(cf || (cf = {}));

/// <reference path="ButtonTag.ts"/>
/// <reference path="InputTag.ts"/>
/// <reference path="SelectTag.ts"/>
/// <reference path="../ui/UserInput.ts"/>
// group tags together, this is done automatically by looking through InputTags with type radio or checkbox and same name attribute.
// single choice logic for Radio Button, <input type="radio", where name is the same
// multi choice logic for Checkboxes, <input type="checkbox", where name is the same
// namespace
var cf;
(function (cf) {
    // class
    var TagGroup = (function () {
        function TagGroup(options) {
            this.elements = options.elements;
            console.log('TagGroup registered:', this.elements[0].type, this);
        }
        Object.defineProperty(TagGroup.prototype, "required", {
            get: function () {
                for (var i = 0; i < this.elements.length; i++) {
                    var element = this.elements[i];
                    if (this.elements[i].required) {
                        return true;
                    }
                }
                return false;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(TagGroup.prototype, "type", {
            get: function () {
                return "group";
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(TagGroup.prototype, "name", {
            get: function () {
                return this.elements[0].name;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(TagGroup.prototype, "label", {
            get: function () {
                return this.elements[0].label;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(TagGroup.prototype, "question", {
            get: function () {
                // check if elements have the questions, else fallback
                var tagQuestion = this.elements[0].question;
                if (tagQuestion) {
                    return tagQuestion;
                }
                else {
                    // fallback to robot response from dictionary
                    var robotReponse = cf.Dictionary.getRobotResponse(this.getGroupTagType());
                    return robotReponse;
                }
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(TagGroup.prototype, "value", {
            get: function () {
                // TODO: fix value???
                return this._values;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(TagGroup.prototype, "disabled", {
            get: function () {
                var disabled = false;
                for (var i = 0; i < this.elements.length; i++) {
                    var element = this.elements[i];
                    if (element.disabled)
                        disabled = true;
                }
                return disabled;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(TagGroup.prototype, "errorMessage", {
            get: function () {
                var errorMessage = cf.Dictionary.get("input-placeholder-error");
                for (var i = 0; i < this.elements.length; i++) {
                    var element = this.elements[i];
                    errorMessage = element.errorMessage;
                }
                return errorMessage;
            },
            enumerable: true,
            configurable: true
        });
        TagGroup.prototype.dealloc = function () {
            for (var i = 0; i < this.elements.length; i++) {
                var element = this.elements[i];
                element.dealloc();
            }
            this.elements = null;
        };
        TagGroup.prototype.refresh = function () {
            for (var i = 0; i < this.elements.length; i++) {
                var element = this.elements[i];
                element.refresh();
            }
        };
        TagGroup.prototype.getGroupTagType = function () {
            return this.elements[0].type;
        };
        TagGroup.prototype.setTagValueAndIsValid = function (value) {
            var isValid = false;
            var groupType = this.elements[0].type;
            this._values = [];
            switch (groupType) {
                case "radio":
                    var numberRadioButtonsVisible = [];
                    var wasRadioButtonChecked = false;
                    for (var i = 0; i < value.controlElements.length; i++) {
                        var element = value.controlElements[i];
                        var tag = this.elements[this.elements.indexOf(element.referenceTag)];
                        if (element.visible) {
                            numberRadioButtonsVisible.push(element);
                            if (tag == element.referenceTag) {
                                tag.domElement.checked = element.checked;
                                if (element.checked)
                                    this._values.push(tag.value);
                                // a radio button was checked
                                if (!wasRadioButtonChecked && element.checked)
                                    wasRadioButtonChecked = true;
                            }
                        }
                    }
                    // special case 1, only one radio button visible from a filter
                    if (!isValid && numberRadioButtonsVisible.length == 1) {
                        var element = numberRadioButtonsVisible[0];
                        var tag = this.elements[this.elements.indexOf(element.referenceTag)];
                        element.checked = true;
                        tag.domElement.checked = true;
                        isValid = true;
                        if (element.checked)
                            this._values.push(tag.value);
                    }
                    else if (!isValid && wasRadioButtonChecked) {
                        // a radio button needs to be checked of
                        isValid = wasRadioButtonChecked;
                    }
                    break;
                case "checkbox":
                    // checkbox is always valid
                    isValid = true;
                    for (var i = 0; i < value.controlElements.length; i++) {
                        var element = value.controlElements[i];
                        var tag = this.elements[this.elements.indexOf(element.referenceTag)];
                        tag.domElement.checked = element.checked;
                        if (element.checked)
                            this._values.push(tag.value);
                    }
                    break;
            }
            return isValid;
        };
        return TagGroup;
    }());
    cf.TagGroup = TagGroup;
})(cf || (cf = {}));

/// <reference path="Tag.ts"/>
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
// namespace
var cf;
(function (cf) {
    // interface
    // class
    var InputTag = (function (_super) {
        __extends(InputTag, _super);
        function InputTag(options) {
            var _this = _super.call(this, options) || this;
            if (_this.type == "text") {
            }
            else if (_this.type == "email") {
            }
            else if (_this.type == "tel") {
            }
            else if (_this.type == "checkbox") {
            }
            else if (_this.type == "radio") {
            }
            else if (_this.type == "password") {
            }
            else if (_this.type == "file") {
            }
            return _this;
        }
        InputTag.prototype.findAndSetQuestions = function () {
            _super.prototype.findAndSetQuestions.call(this);
            // special use cases for <input> tag add here...
        };
        InputTag.prototype.findAndSetLabel = function () {
            _super.prototype.findAndSetLabel.call(this);
            if (!this._label) {
            }
        };
        InputTag.prototype.setTagValueAndIsValid = function (value) {
            if (this.type == "checkbox") {
                // checkbox is always true..
                return true;
            }
            else {
                return _super.prototype.setTagValueAndIsValid.call(this, value);
            }
        };
        InputTag.prototype.dealloc = function () {
            _super.prototype.dealloc.call(this);
        };
        return InputTag;
    }(cf.Tag));
    cf.InputTag = InputTag;
})(cf || (cf = {}));

/// <reference path="Tag.ts"/>
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
// namespace
var cf;
(function (cf) {
    // interface
    // class
    var SelectTag = (function (_super) {
        __extends(SelectTag, _super);
        function SelectTag(options) {
            var _this = _super.call(this, options) || this;
            // build the option tags
            _this.optionTags = [];
            var domOptionTags = _this.domElement.getElementsByTagName("option");
            for (var i = 0; i < domOptionTags.length; i++) {
                var element = domOptionTags[i];
                var tag = cf.Tag.createTag(element);
                if (tag) {
                    _this.optionTags.push(tag);
                }
                else {
                }
            }
            return _this;
        }
        Object.defineProperty(SelectTag.prototype, "type", {
            get: function () {
                return "select";
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(SelectTag.prototype, "value", {
            get: function () {
                return this._values;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(SelectTag.prototype, "multipleChoice", {
            get: function () {
                return this.domElement.hasAttribute("multiple");
            },
            enumerable: true,
            configurable: true
        });
        SelectTag.prototype.setTagValueAndIsValid = function (dto) {
            var isValid = false;
            // select tag values are set via selected attribute on option tag
            var numberOptionButtonsVisible = [];
            this._values = [];
            for (var i = 0; i < this.optionTags.length; i++) {
                var tag = this.optionTags[i];
                for (var j = 0; j < dto.controlElements.length; j++) {
                    var controllerElement = dto.controlElements[j];
                    if (controllerElement.referenceTag == tag) {
                        // tag match found, so set value
                        tag.selected = controllerElement.selected;
                        // check for minimum one selected
                        if (!isValid && tag.selected)
                            isValid = true;
                        if (tag.selected)
                            this._values.push(tag.value);
                        if (controllerElement.visible)
                            numberOptionButtonsVisible.push(controllerElement);
                    }
                }
            }
            // special case 1, only one optiontag visible from a filter
            if (!isValid && numberOptionButtonsVisible.length == 1) {
                var element = numberOptionButtonsVisible[0];
                var tag = this.optionTags[this.optionTags.indexOf(element.referenceTag)];
                element.selected = true;
                tag.selected = true;
                isValid = true;
                if (tag.selected)
                    this._values.push(tag.value);
            }
            return isValid;
        };
        return SelectTag;
    }(cf.Tag));
    cf.SelectTag = SelectTag;
})(cf || (cf = {}));

/// <reference path="Tag.ts"/>
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
// namespace
var cf;
(function (cf) {
    // interface
    // class
    var ButtonTag = (function (_super) {
        __extends(ButtonTag, _super);
        function ButtonTag(options) {
            var _this = _super.call(this, options) || this;
            if (_this.domElement.getAttribute("type") == "submit") {
            }
            else if (_this.domElement.getAttribute("type") == "button") {
            }
            return _this;
        }
        return ButtonTag;
    }(cf.Tag));
    cf.ButtonTag = ButtonTag;
})(cf || (cf = {}));

/// <reference path="Tag.ts"/>
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
// namespace
var cf;
(function (cf) {
    // interface
    // class
    var OptionTag = (function (_super) {
        __extends(OptionTag, _super);
        function OptionTag() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        Object.defineProperty(OptionTag.prototype, "type", {
            get: function () {
                return "option";
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(OptionTag.prototype, "label", {
            get: function () {
                return cf.Helpers.getInnerTextOfElement(this.domElement);
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(OptionTag.prototype, "selected", {
            get: function () {
                return this.domElement.selected;
            },
            set: function (value) {
                if (value)
                    this.domElement.setAttribute("selected", "selected");
                else
                    this.domElement.removeAttribute("selected");
            },
            enumerable: true,
            configurable: true
        });
        OptionTag.prototype.setTagValueAndIsValid = function (value) {
            var isValid = true;
            // OBS: No need to set any validation og value for this tag type ..
            // .. it is atm. only used to create pseudo elements in the OptionsList
            return isValid;
        };
        return OptionTag;
    }(cf.Tag));
    cf.OptionTag = OptionTag;
})(cf || (cf = {}));

/// <reference path="ControlElement.ts"/>
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
// namespace
var cf;
(function (cf) {
    // interface
    // class
    var Button = (function (_super) {
        __extends(Button, _super);
        function Button(options) {
            var _this = _super.call(this, options) || this;
            _this.clickCallback = _this.onClick.bind(_this);
            _this.el.addEventListener("click", _this.clickCallback, false);
            _this.mouseDownCallback = _this.onMouseDown.bind(_this);
            _this.el.addEventListener("mousedown", _this.mouseDownCallback, false);
            //image
            _this.checkForImage();
            return _this;
        }
        Object.defineProperty(Button.prototype, "type", {
            get: function () {
                return "Button";
            },
            enumerable: true,
            configurable: true
        });
        Button.prototype.hasImage = function () {
            var hasImage = !!this.referenceTag.domElement.getAttribute("cf-image");
            return hasImage;
        };
        /**
        * @name checkForImage
        * checks if element has cf-image, if it has then change UI
        */
        Button.prototype.checkForImage = function () {
            var hasImage = this.hasImage();
            if (hasImage) {
                this.el.classList.add("has-image");
                this.imgEl = document.createElement("img");
                this.imageLoadedCallback = this.onImageLoaded.bind(this);
                this.imgEl.classList.add("cf-image");
                this.imgEl.addEventListener("load", this.imageLoadedCallback, false);
                this.imgEl.src = this.referenceTag.domElement.getAttribute("cf-image");
                this.el.insertBefore(this.imgEl, this.el.children[0]);
            }
        };
        Button.prototype.onImageLoaded = function () {
            this.imgEl.classList.add("loaded");
            document.dispatchEvent(new CustomEvent(cf.ControlElementEvents.ON_LOADED, {}));
        };
        Button.prototype.onMouseDown = function (event) {
            event.preventDefault();
        };
        Button.prototype.onClick = function (event) {
            this.onChoose();
        };
        Button.prototype.dealloc = function () {
            this.el.removeEventListener("click", this.clickCallback, false);
            this.clickCallback = null;
            if (this.imageLoadedCallback) {
                this.imgEl.removeEventListener("load", this.imageLoadedCallback, false);
                this.imageLoadedCallback = null;
            }
            this.el.removeEventListener("mousedown", this.mouseDownCallback, false);
            this.mouseDownCallback = null;
            _super.prototype.dealloc.call(this);
        };
        // override
        Button.prototype.getTemplate = function () {
            return "<cf-button class=\"cf-button\">\n\t\t\t\t" + this.referenceTag.label + "\n\t\t\t</cf-button>\n\t\t\t";
        };
        return Button;
    }(cf.ControlElement));
    cf.Button = Button;
})(cf || (cf = {}));

/// <reference path="Button.ts"/>
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
// namespace
var cf;
(function (cf) {
    // interface
    // class
    var RadioButton = (function (_super) {
        __extends(RadioButton, _super);
        function RadioButton() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        Object.defineProperty(RadioButton.prototype, "type", {
            get: function () {
                return "RadioButton";
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(RadioButton.prototype, "checked", {
            get: function () {
                var _checked = this.el.hasAttribute("checked") && this.el.getAttribute("checked") == "checked";
                return _checked;
            },
            set: function (value) {
                if (!value) {
                    this.el.removeAttribute("checked");
                }
                else {
                    this.el.setAttribute("checked", "checked");
                }
            },
            enumerable: true,
            configurable: true
        });
        RadioButton.prototype.onClick = function (event) {
            this.checked = !this.checked;
            _super.prototype.onClick.call(this, event);
        };
        // override
        RadioButton.prototype.getTemplate = function () {
            var isChecked = this.referenceTag.value == "1" || this.referenceTag.domElement.hasAttribute("checked");
            return "<cf-radio-button class=\"cf-button\" checked=" + (isChecked ? "checked" : "") + ">\n\t\t\t\t<div>\n\t\t\t\t\t<cf-radio></cf-radio>\n\t\t\t\t\t" + this.referenceTag.label + "\n\t\t\t\t</div>\n\t\t\t</cf-radio-button>\n\t\t\t";
        };
        return RadioButton;
    }(cf.Button));
    cf.RadioButton = RadioButton;
})(cf || (cf = {}));

/// <reference path="Button.ts"/>
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
// namespace
var cf;
(function (cf) {
    // interface
    // class
    var CheckboxButton = (function (_super) {
        __extends(CheckboxButton, _super);
        function CheckboxButton() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        Object.defineProperty(CheckboxButton.prototype, "type", {
            get: function () {
                return "CheckboxButton";
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(CheckboxButton.prototype, "checked", {
            get: function () {
                return this.el.getAttribute("checked") == "checked";
            },
            set: function (value) {
                if (!value) {
                    this.el.removeAttribute("checked");
                    this.referenceTag.domElement.value = "0";
                    this.referenceTag.domElement.removeAttribute("checked");
                }
                else {
                    this.el.setAttribute("checked", "checked");
                    this.referenceTag.domElement.value = "1";
                    this.referenceTag.domElement.setAttribute("checked", "checked");
                }
            },
            enumerable: true,
            configurable: true
        });
        CheckboxButton.prototype.onClick = function (event) {
            this.checked = !this.checked;
        };
        // override
        CheckboxButton.prototype.getTemplate = function () {
            var isChecked = this.referenceTag.value == "1" || this.referenceTag.domElement.hasAttribute("checked");
            return "<cf-button class=\"cf-button cf-checkbox-button " + (this.referenceTag.label.trim().length == 0 ? "no-text" : "") + "\" checked=" + (isChecked ? "checked" : "") + ">\n\t\t\t\t<div>\n\t\t\t\t\t<cf-checkbox></cf-checkbox>\n\t\t\t\t\t" + this.referenceTag.label + "\n\t\t\t\t</div>\n\t\t\t</cf-button>\n\t\t\t";
        };
        return CheckboxButton;
    }(cf.Button));
    cf.CheckboxButton = CheckboxButton;
})(cf || (cf = {}));

/// <reference path="Button.ts"/>
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
// namespace
var cf;
(function (cf) {
    // interface
    cf.OptionButtonEvents = {
        CLICK: "cf-option-button-click"
    };
    // class
    var OptionButton = (function (_super) {
        __extends(OptionButton, _super);
        function OptionButton() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.isMultiChoice = false;
            return _this;
        }
        Object.defineProperty(OptionButton.prototype, "type", {
            get: function () {
                return "OptionButton";
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(OptionButton.prototype, "selected", {
            get: function () {
                return this.el.hasAttribute("selected");
            },
            set: function (value) {
                if (value) {
                    this.el.setAttribute("selected", "selected");
                }
                else {
                    this.el.removeAttribute("selected");
                }
            },
            enumerable: true,
            configurable: true
        });
        OptionButton.prototype.setData = function (options) {
            this.isMultiChoice = options.isMultiChoice;
            _super.prototype.setData.call(this, options);
        };
        OptionButton.prototype.onClick = function (event) {
            cf.ConversationalForm.illustrateFlow(this, "dispatch", cf.OptionButtonEvents.CLICK, this);
            document.dispatchEvent(new CustomEvent(cf.OptionButtonEvents.CLICK, {
                detail: this
            }));
        };
        // override
        OptionButton.prototype.getTemplate = function () {
            // be aware that first option element on none multiple select tags will be selected by default
            var tmpl = '<cf-button class="cf-button ' + (this.isMultiChoice ? "cf-checkbox-button" : "") + '" ' + (this.referenceTag.domElement.selected ? "selected='selected'" : "") + '>';
            tmpl += "<div>";
            if (this.isMultiChoice)
                tmpl += "<cf-checkbox></cf-checkbox>";
            tmpl += this.referenceTag.label;
            tmpl += "</div>";
            tmpl += "</cf-button>";
            return tmpl;
        };
        return OptionButton;
    }(cf.Button));
    cf.OptionButton = OptionButton;
})(cf || (cf = {}));

/// <reference path="ControlElement.ts"/>
/// <reference path="OptionButton.ts"/>
// namespace
var cf;
(function (cf) {
    // interface
    // class
    // builds x OptionsButton from the registered SelectTag
    var OptionsList = (function () {
        function OptionsList(options) {
            this.context = options.context;
            this.referenceTag = options.referenceTag;
            // check for multi choice select tag
            this.multiChoice = this.referenceTag.domElement.hasAttribute("multiple");
            this.onOptionButtonClickCallback = this.onOptionButtonClick.bind(this);
            document.addEventListener(cf.OptionButtonEvents.CLICK, this.onOptionButtonClickCallback, false);
            this.createElements();
        }
        Object.defineProperty(OptionsList.prototype, "type", {
            get: function () {
                return "OptionsList";
            },
            enumerable: true,
            configurable: true
        });
        OptionsList.prototype.getValue = function () {
            var arr = [];
            for (var i = 0; i < this.elements.length; i++) {
                var element = this.elements[i];
                if (!this.multiChoice && element.selected) {
                    arr.push(element);
                    return arr;
                }
                else if (this.multiChoice && element.selected) {
                    arr.push(element);
                }
            }
            return arr;
        };
        OptionsList.prototype.onOptionButtonClick = function (event) {
            // if mutiple... then don remove selection on other buttons
            var isMutiple = false;
            if (!this.multiChoice) {
                // only one is selectable at the time.
                for (var i = 0; i < this.elements.length; i++) {
                    var element = this.elements[i];
                    if (element != event.detail) {
                        element.selected = false;
                    }
                    else {
                        element.selected = true;
                    }
                }
                cf.ConversationalForm.illustrateFlow(this, "dispatch", cf.ControlElementEvents.SUBMIT_VALUE, this.referenceTag);
                document.dispatchEvent(new CustomEvent(cf.ControlElementEvents.SUBMIT_VALUE, {
                    detail: event.detail
                }));
            }
            else {
                event.detail.selected = !event.detail.selected;
            }
        };
        OptionsList.prototype.createElements = function () {
            this.elements = [];
            var optionTags = this.referenceTag.optionTags;
            for (var i = 0; i < optionTags.length; i++) {
                var tag = optionTags[i];
                var btn = new cf.OptionButton({
                    referenceTag: tag,
                    isMultiChoice: this.referenceTag.multipleChoice,
                });
                this.elements.push(btn);
                this.context.appendChild(btn.el);
            }
        };
        OptionsList.prototype.dealloc = function () {
            document.removeEventListener(cf.OptionButtonEvents.CLICK, this.onOptionButtonClickCallback, false);
            this.onOptionButtonClickCallback = null;
            while (this.elements.length > 0)
                this.elements.pop().dealloc();
            this.elements = null;
        };
        return OptionsList;
    }());
    cf.OptionsList = OptionsList;
})(cf || (cf = {}));

/// <reference path="Button.ts"/>
/// <reference path="../../logic/Helpers.ts"/>
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
// namespace
var cf;
(function (cf) {
    // interface
    // class
    var UploadFileUI = (function (_super) {
        __extends(UploadFileUI, _super);
        function UploadFileUI(options) {
            var _this = _super.call(this, options) || this;
            _this.maxFileSize = 100000000000;
            _this.loading = false;
            _this.submitTimer = 0;
            _this._fileName = "";
            _this._readerResult = "";
            if (cf.Helpers.caniuse.fileReader()) {
                var maxFileSizeStr = _this.referenceTag.domElement.getAttribute("cf-max-size") || _this.referenceTag.domElement.getAttribute("max-size");
                if (maxFileSizeStr) {
                    var maxFileSize = parseInt(maxFileSizeStr, 10);
                    _this.maxFileSize = maxFileSize;
                }
                _this.progressBar = _this.el.getElementsByTagName("cf-upload-file-progress-bar")[0];
                _this.onDomElementChangeCallback = _this.onDomElementChange.bind(_this);
                _this.referenceTag.domElement.addEventListener("change", _this.onDomElementChangeCallback, false);
            }
            else {
                throw new Error("Conversational Form Error: No FileReader available for client.");
            }
            return _this;
        }
        Object.defineProperty(UploadFileUI.prototype, "value", {
            get: function () {
                return this.referenceTag.domElement.value; //;this.readerResult || this.fileName;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(UploadFileUI.prototype, "readerResult", {
            get: function () {
                return this._readerResult;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(UploadFileUI.prototype, "files", {
            get: function () {
                return this._files;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(UploadFileUI.prototype, "fileName", {
            get: function () {
                return this._fileName;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(UploadFileUI.prototype, "type", {
            get: function () {
                return "UploadFileUI";
            },
            enumerable: true,
            configurable: true
        });
        UploadFileUI.prototype.onDomElementChange = function (event) {
            var _this = this;
            var reader = new FileReader();
            this._files = this.referenceTag.domElement.files;
            reader.onerror = function (event) {
                console.log("onerror", event);
            };
            reader.onprogress = function (event) {
                console.log("onprogress", event);
                _this.progressBar.style.width = ((event.loaded / event.total) * 100) + "%";
            };
            reader.onabort = function (event) {
                console.log("onabort", event);
            };
            reader.onloadstart = function (event) {
                // check for file size
                var file = _this.files[0];
                var fileSize = file ? file.size : _this.maxFileSize + 1; // if file is undefined then abort ...
                if (fileSize > _this.maxFileSize) {
                    reader.abort();
                    var dto = {
                        errorText: cf.Dictionary.get("input-placeholder-file-size-error")
                    };
                    cf.ConversationalForm.illustrateFlow(_this, "dispatch", cf.FlowEvents.USER_INPUT_INVALID, dto);
                    document.dispatchEvent(new CustomEvent(cf.FlowEvents.USER_INPUT_INVALID, {
                        detail: dto
                    }));
                }
                else {
                    // good to go
                    _this._fileName = file.name;
                    _this.loading = true;
                    _this.animateIn();
                    // set text
                    var sizeConversion = Math.floor(Math.log(fileSize) / Math.log(1024));
                    var sizeChart = ["b", "kb", "mb", "gb"];
                    sizeConversion = Math.min(sizeChart.length - 1, sizeConversion);
                    var humanSizeString = Number((fileSize / Math.pow(1024, sizeConversion)).toFixed(2)) * 1 + " " + sizeChart[sizeConversion];
                    var text = file.name + " (" + humanSizeString + ")";
                    _this.el.getElementsByTagName("cf-upload-file-text")[0].innerHTML = text;
                    document.dispatchEvent(new CustomEvent(cf.ControlElementEvents.PROGRESS_CHANGE, {
                        detail: cf.ControlElementProgressStates.BUSY
                    }));
                }
            };
            reader.onload = function (event) {
                _this._readerResult = event.target.result;
                _this.progressBar.classList.add("loaded");
                _this.submitTimer = setTimeout(function () {
                    _this.el.classList.remove("animate-in");
                    _this.onChoose(); // submit the file
                    document.dispatchEvent(new CustomEvent(cf.ControlElementEvents.PROGRESS_CHANGE, {
                        detail: cf.ControlElementProgressStates.READY
                    }));
                }, 0);
            };
            reader.readAsDataURL(this.files[0]);
        };
        UploadFileUI.prototype.animateIn = function () {
            if (this.loading)
                _super.prototype.animateIn.call(this);
        };
        UploadFileUI.prototype.onClick = function (event) {
            // super.onClick(event);
        };
        UploadFileUI.prototype.triggerFileSelect = function () {
            // trigger file prompt
            this.referenceTag.domElement.click();
        };
        // override
        UploadFileUI.prototype.dealloc = function () {
            clearTimeout(this.submitTimer);
            this.progressBar = null;
            if (this.onDomElementChangeCallback) {
                this.referenceTag.domElement.removeEventListener("change", this.onDomElementChangeCallback, false);
                this.onDomElementChangeCallback = null;
            }
            _super.prototype.dealloc.call(this);
        };
        UploadFileUI.prototype.getTemplate = function () {
            var isChecked = this.referenceTag.value == "1" || this.referenceTag.domElement.hasAttribute("checked");
            return "<cf-upload-file-ui>\n\t\t\t\t<cf-upload-file-text></cf-upload-file-text>\n\t\t\t\t<cf-upload-file-progress>\n\t\t\t\t\t<cf-upload-file-progress-bar></cf-upload-file-progress-bar>\n\t\t\t\t</cf-upload-file-progress>\n\t\t\t</cf-upload-file-ui>\n\t\t\t";
        };
        return UploadFileUI;
    }(cf.Button));
    cf.UploadFileUI = UploadFileUI;
})(cf || (cf = {}));

/// <reference path="BasicElement.ts"/>
/// <reference path="control-elements/ControlElements.ts"/>
/// <reference path="../logic/FlowManager.ts"/>
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
// namespace
var cf;
(function (cf) {
    // interface
    cf.UserInputEvents = {
        SUBMIT: "cf-input-user-input-submit",
        //	detail: string
        KEY_CHANGE: "cf-input-key-change",
        //	detail: string
        CONTROL_ELEMENTS_ADDED: "cf-input-control-elements-added",
    };
    // class
    var UserInput = (function (_super) {
        __extends(UserInput, _super);
        function UserInput(options) {
            var _this = _super.call(this, options) || this;
            _this.currentValue = "";
            _this.errorTimer = 0;
            _this.shiftIsDown = false;
            _this._disabled = false;
            //acts as a fallb ack for ex. shadow dom implementation
            _this._active = false;
            _this.inputElement = _this.el.getElementsByTagName("textarea")[0];
            _this.onInputFocusCallback = _this.onInputFocus.bind(_this);
            _this.inputElement.addEventListener('focus', _this.onInputFocusCallback, false);
            _this.onInputBlurCallback = _this.onInputBlur.bind(_this);
            _this.inputElement.addEventListener('blur', _this.onInputBlurCallback, false);
            //<cf-input-control-elements> is defined in the ChatList.ts
            _this.controlElements = new cf.ControlElements({
                el: _this.el.getElementsByTagName("cf-input-control-elements")[0]
            });
            // setup event listeners
            _this.windowFocusCallback = _this.windowFocus.bind(_this);
            window.addEventListener('focus', _this.windowFocusCallback, false);
            _this.keyUpCallback = _this.onKeyUp.bind(_this);
            document.addEventListener("keyup", _this.keyUpCallback, false);
            _this.keyDownCallback = _this.onKeyDown.bind(_this);
            document.addEventListener("keydown", _this.keyDownCallback, false);
            _this.flowUpdateCallback = _this.onFlowUpdate.bind(_this);
            document.addEventListener(cf.FlowEvents.FLOW_UPDATE, _this.flowUpdateCallback, false);
            _this.inputInvalidCallback = _this.inputInvalid.bind(_this);
            document.addEventListener(cf.FlowEvents.USER_INPUT_INVALID, _this.inputInvalidCallback, false);
            _this.onControlElementSubmitCallback = _this.onControlElementSubmit.bind(_this);
            document.addEventListener(cf.ControlElementEvents.SUBMIT_VALUE, _this.onControlElementSubmitCallback, false);
            _this.onControlElementProgressChangeCallback = _this.onControlElementProgressChange.bind(_this);
            document.addEventListener(cf.ControlElementEvents.PROGRESS_CHANGE, _this.onControlElementProgressChangeCallback, false);
            _this.submitButton = _this.el.getElementsByTagName("cf-input-button")[0];
            _this.onSubmitButtonClickCallback = _this.onSubmitButtonClick.bind(_this);
            _this.submitButton.addEventListener("click", _this.onSubmitButtonClickCallback, false);
            return _this;
        }
        Object.defineProperty(UserInput.prototype, "active", {
            get: function () {
                return this.inputElement === document.activeElement || this._active;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(UserInput.prototype, "visible", {
            set: function (value) {
                if (!this.el.classList.contains("animate-in") && value)
                    this.el.classList.add("animate-in");
                else if (this.el.classList.contains("animate-in") && !value)
                    this.el.classList.remove("animate-in");
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(UserInput.prototype, "currentTag", {
            get: function () {
                return this._currentTag;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(UserInput.prototype, "disabled", {
            set: function (value) {
                var hasChanged = this._disabled != value;
                if (hasChanged) {
                    this._disabled = value;
                    if (value) {
                        this.el.setAttribute("disabled", "disabled");
                        this.inputElement.blur();
                    }
                    else {
                        this.setFocusOnInput();
                        this.el.removeAttribute("disabled");
                    }
                }
            },
            enumerable: true,
            configurable: true
        });
        UserInput.prototype.getInputValue = function () {
            var str = this.inputElement.value;
            // Build-in way to handle XSS issues ->
            var div = document.createElement('div');
            div.appendChild(document.createTextNode(str));
            return div.innerHTML;
        };
        UserInput.prototype.getFlowDTO = function () {
            var value; // = this.inputElement.value;
            // check for values on control elements as they should overwrite the input value.
            if (this.controlElements && this.controlElements.active) {
                value = this.controlElements.getDTO();
            }
            else {
                value = {
                    text: this.getInputValue()
                };
            }
            value.input = this;
            return value;
        };
        UserInput.prototype.onFlowStopped = function () {
            if (this.controlElements)
                this.controlElements.reset();
            this.disabled = true;
            this.visible = false;
        };
        UserInput.prototype.onInputChange = function () {
            if (!this.active && !this.controlElements.active)
                return;
            this.inputElement.style.height = "0px";
            this.inputElement.style.height = this.inputElement.scrollHeight + "px";
        };
        UserInput.prototype.inputInvalid = function (event) {
            var _this = this;
            cf.ConversationalForm.illustrateFlow(this, "receive", event.type, event.detail);
            var dto = event.detail;
            this.inputElement.setAttribute("data-value", this.inputElement.value);
            this.inputElement.value = "";
            this.el.setAttribute("error", "");
            this.disabled = true;
            // cf-error
            this.inputElement.setAttribute("placeholder", dto.errorText || this._currentTag.errorMessage);
            clearTimeout(this.errorTimer);
            this.errorTimer = setTimeout(function () {
                _this.disabled = false;
                _this.el.removeAttribute("error");
                _this.inputElement.value = _this.inputElement.getAttribute("data-value");
                _this.inputElement.setAttribute("data-value", "");
                _this.setPlaceholder();
                _this.setFocusOnInput();
                if (_this.controlElements)
                    _this.controlElements.resetAfterErrorMessage();
            }, UserInput.ERROR_TIME);
        };
        UserInput.prototype.setPlaceholder = function () {
            if (this._currentTag) {
                if (this._currentTag.inputPlaceholder) {
                    this.inputElement.setAttribute("placeholder", this._currentTag.inputPlaceholder);
                }
                else {
                    this.inputElement.setAttribute("placeholder", this._currentTag.type == "group" ? cf.Dictionary.get("group-placeholder") : cf.Dictionary.get("input-placeholder"));
                }
            }
            else {
                this.inputElement.setAttribute("placeholder", cf.Dictionary.get("group-placeholder"));
            }
        };
        UserInput.prototype.onFlowUpdate = function (event) {
            var _this = this;
            cf.ConversationalForm.illustrateFlow(this, "receive", event.type, event.detail);
            // animate input field in
            this.visible = true;
            this._currentTag = event.detail;
            this.el.setAttribute("tag-type", this._currentTag.type);
            // set input field to type password if the dom input field is that, covering up the input
            this.inputElement.setAttribute("type", this._currentTag.type == "password" ? "password" : "input");
            clearTimeout(this.errorTimer);
            this.el.removeAttribute("error");
            this.inputElement.setAttribute("data-value", "");
            this.inputElement.value = "";
            this.setPlaceholder();
            this.resetValue();
            if (!UserInput.preventAutoFocus)
                this.setFocusOnInput();
            this.controlElements.reset();
            if (this._currentTag.type == "group") {
                this.buildControlElements(this._currentTag.elements);
            }
            else {
                this.buildControlElements([this._currentTag]);
            }
            if (this._currentTag.type == "text" || this._currentTag.type == "email") {
                this.inputElement.value = this._currentTag.defaultValue.toString();
                this.onInputChange();
            }
            setTimeout(function () {
                _this.disabled = false;
            }, 150);
        };
        UserInput.prototype.onControlElementProgressChange = function (event) {
            var status = event.detail;
            this.disabled = status == cf.ControlElementProgressStates.BUSY;
        };
        UserInput.prototype.buildControlElements = function (tags) {
            this.controlElements.buildTags(tags);
        };
        UserInput.prototype.onControlElementSubmit = function (event) {
            cf.ConversationalForm.illustrateFlow(this, "receive", event.type, event.detail);
            // when ex a RadioButton is clicked..
            var controlElement = event.detail;
            this.controlElements.updateStateOnElements(controlElement);
            this.doSubmit();
        };
        UserInput.prototype.onSubmitButtonClick = function (event) {
            this.onEnterOrSubmitButtonSubmit(event);
        };
        UserInput.prototype.onKeyDown = function (event) {
            if (!this.active && !this.controlElements.focus)
                return;
            if (event.keyCode == cf.Dictionary.keyCodes["shift"])
                this.shiftIsDown = true;
            // prevent textarea line breaks
            if (event.keyCode == cf.Dictionary.keyCodes["enter"] && !event.shiftKey)
                event.preventDefault();
            else {
                // handle password input
                if (this._currentTag && this._currentTag.type == "password") {
                    var canSetValue = event.key.toLowerCase() == "backspace" || event.key.toLowerCase() == "space" || event.code.toLowerCase().indexOf("key") != -1;
                    if (canSetValue) {
                        this.inputElement.value = this.currentValue.replace(/./g, function () { return "*"; });
                        if (event.key.toLowerCase() == "backspace")
                            this.currentValue = this.currentValue.length > 0 ? this.currentValue.slice(0, this.currentValue.length - 1) : "";
                        else
                            this.currentValue += event.key;
                    }
                }
            }
        };
        UserInput.prototype.onKeyUp = function (event) {
            if (!this.active && !this.controlElements.focus)
                return;
            // reset current value, happens when user selects all text and delete or cmd+backspace
            if (this.inputElement.value == "" || this.inputElement.selectionStart != this.inputElement.selectionEnd)
                this.currentValue = "";
            if (event.keyCode == cf.Dictionary.keyCodes["shift"]) {
                this.shiftIsDown = false;
            }
            else if (event.keyCode == cf.Dictionary.keyCodes["up"]) {
                event.preventDefault();
                if (this.active && !this.controlElements.focus)
                    this.controlElements.focusFrom("bottom");
            }
            else if (event.keyCode == cf.Dictionary.keyCodes["down"]) {
                event.preventDefault();
                if (this.active && !this.controlElements.focus)
                    this.controlElements.focusFrom("top");
            }
            else if (event.keyCode == cf.Dictionary.keyCodes["tab"]) {
                // tab key pressed, check if node is child of CF, if then then reset focus to input element
                var doesKeyTargetExistInCF = false;
                var node = event.target.parentNode;
                while (node != null) {
                    if (node === window.ConversationalForm.el) {
                        doesKeyTargetExistInCF = true;
                        break;
                    }
                    node = node.parentNode;
                }
                // prevent normal behaviour, we are not here to take part, we are here to take over!
                if (!doesKeyTargetExistInCF) {
                    event.preventDefault();
                    if (!this.controlElements.active)
                        this.setFocusOnInput();
                }
            }
            if (this.el.hasAttribute("disabled"))
                return;
            var value = this.getFlowDTO();
            if ((event.keyCode == cf.Dictionary.keyCodes["enter"] && !event.shiftKey) || event.keyCode == cf.Dictionary.keyCodes["space"]) {
                if (event.keyCode == cf.Dictionary.keyCodes["enter"] && this.active) {
                    event.preventDefault();
                    this.onEnterOrSubmitButtonSubmit();
                }
                else {
                    // either click on submit button or do something with control elements
                    if (event.keyCode == cf.Dictionary.keyCodes["enter"] || event.keyCode == cf.Dictionary.keyCodes["space"]) {
                        event.preventDefault();
                        var tagType = this._currentTag.type == "group" ? this._currentTag.getGroupTagType() : this._currentTag.type;
                        if (tagType == "select" || tagType == "checkbox") {
                            var mutiTag = this._currentTag;
                            // if select or checkbox then check for multi select item
                            if (tagType == "checkbox" || mutiTag.multipleChoice) {
                                if (this.active && event.keyCode == cf.Dictionary.keyCodes["enter"]) {
                                    // click on UserInput submit button, only ENTER allowed
                                    this.submitButton.click();
                                }
                                else {
                                    // let UI know that we changed the key
                                    this.dispatchKeyChange(value, event.keyCode);
                                    if (!this.active) {
                                        // after ui has been selected we RESET the input/filter
                                        this.resetValue();
                                        this.setFocusOnInput();
                                        this.dispatchKeyChange(value, event.keyCode);
                                    }
                                }
                            }
                            else {
                                this.dispatchKeyChange(value, event.keyCode);
                            }
                        }
                        else {
                            if (this._currentTag.type == "group") {
                                // let the controlements handle action
                                this.dispatchKeyChange(value, event.keyCode);
                            }
                        }
                    }
                    else if (event.keyCode == cf.Dictionary.keyCodes["space"] && document.activeElement) {
                        this.dispatchKeyChange(value, event.keyCode);
                    }
                }
            }
            else if (event.keyCode != cf.Dictionary.keyCodes["shift"] && event.keyCode != cf.Dictionary.keyCodes["tab"]) {
                this.dispatchKeyChange(value, event.keyCode);
            }
            this.onInputChange();
        };
        UserInput.prototype.dispatchKeyChange = function (dto, keyCode) {
            cf.ConversationalForm.illustrateFlow(this, "dispatch", cf.UserInputEvents.KEY_CHANGE, dto);
            document.dispatchEvent(new CustomEvent(cf.UserInputEvents.KEY_CHANGE, {
                detail: {
                    dto: dto,
                    keyCode: keyCode,
                    inputFieldActive: this.active
                }
            }));
        };
        UserInput.prototype.windowFocus = function (event) {
            if (!UserInput.preventAutoFocus)
                this.setFocusOnInput();
        };
        UserInput.prototype.onInputBlur = function (event) {
            this._active = false;
        };
        UserInput.prototype.onInputFocus = function (event) {
            this._active = true;
            this.onInputChange();
        };
        UserInput.prototype.setFocusOnInput = function () {
            this.inputElement.focus();
        };
        UserInput.prototype.onEnterOrSubmitButtonSubmit = function (event) {
            if (event === void 0) { event = null; }
            // we need to check if current tag is file
            if (this._currentTag.type == "file" && event) {
                // trigger <input type="file" but only when it's from clicking button
                this.controlElements.getElement(0).triggerFileSelect();
            }
            else {
                // for groups, we expect that there is always a default value set
                this.doSubmit();
            }
        };
        UserInput.prototype.doSubmit = function () {
            var value = this.getFlowDTO();
            this.disabled = true;
            this.el.removeAttribute("error");
            this.inputElement.setAttribute("data-value", "");
            cf.ConversationalForm.illustrateFlow(this, "dispatch", cf.UserInputEvents.SUBMIT, value);
            document.dispatchEvent(new CustomEvent(cf.UserInputEvents.SUBMIT, {
                detail: value
            }));
        };
        UserInput.prototype.resetValue = function () {
            this.inputElement.value = "";
            this.onInputChange();
        };
        UserInput.prototype.dealloc = function () {
            this.inputElement.removeEventListener('blur', this.onInputBlurCallback, false);
            this.onInputBlurCallback = null;
            this.inputElement.removeEventListener('focus', this.onInputFocusCallback, false);
            this.onInputFocusCallback = null;
            window.removeEventListener('focus', this.windowFocusCallback, false);
            this.windowFocusCallback = null;
            document.removeEventListener("keydown", this.keyDownCallback, false);
            this.keyDownCallback = null;
            document.removeEventListener("keyup", this.keyUpCallback, false);
            this.keyUpCallback = null;
            document.removeEventListener(cf.FlowEvents.FLOW_UPDATE, this.flowUpdateCallback, false);
            this.flowUpdateCallback = null;
            document.removeEventListener(cf.FlowEvents.USER_INPUT_INVALID, this.inputInvalidCallback, false);
            this.inputInvalidCallback = null;
            document.removeEventListener(cf.ControlElementEvents.SUBMIT_VALUE, this.onControlElementSubmitCallback, false);
            this.onControlElementSubmitCallback = null;
            this.submitButton = this.el.getElementsByClassName("cf-input-button")[0];
            this.submitButton.removeEventListener("click", this.onSubmitButtonClickCallback, false);
            this.onSubmitButtonClickCallback = null;
            _super.prototype.dealloc.call(this);
        };
        // override
        UserInput.prototype.getTemplate = function () {
            return "<cf-input>\n\t\t\t\t<cf-input-control-elements>\n\t\t\t\t\t<cf-list-button direction=\"prev\">\n\t\t\t\t\t</cf-list-button>\n\t\t\t\t\t<cf-list-button direction=\"next\">\n\t\t\t\t\t</cf-list-button>\n\t\t\t\t\t<cf-list>\n\t\t\t\t\t\t<cf-info></cf-info>\n\t\t\t\t\t</cf-list>\n\t\t\t\t</cf-input-control-elements>\n\n\t\t\t\t<cf-input-button class=\"cf-input-button\">\n\t\t\t\t\t<div class=\"cf-icon-progress\"></div>\n\t\t\t\t\t<div class=\"cf-icon-attachment\"></div>\n\t\t\t\t</cf-input-button>\n\t\t\t\t\n\t\t\t\t<textarea type='input' tabindex=\"1\" rows=\"1\"></textarea>\n\n\t\t\t</cf-input>\n\t\t\t";
        };
        return UserInput;
    }(cf.BasicElement));
    UserInput.preventAutoFocus = false;
    UserInput.ERROR_TIME = 2000;
    cf.UserInput = UserInput;
})(cf || (cf = {}));

/// <reference path="../BasicElement.ts"/>
/// <reference path="../../logic/Helpers.ts"/>
/// <reference path="../../ConversationalForm.ts"/>
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
// namespace
var cf;
(function (cf) {
    cf.ChatResponseEvents = {
        ROBOT_QUESTION_ASKED: "cf-on-robot-asked-question",
        USER_ANSWER_CLICKED: "cf-on-user-answer-clicked",
    };
    // class
    var ChatResponse = (function (_super) {
        __extends(ChatResponse, _super);
        function ChatResponse(options) {
            var _this = _super.call(this, options) || this;
            _this.tag = options.tag;
            return _this;
        }
        Object.defineProperty(ChatResponse.prototype, "visible", {
            set: function (value) {
                if (value) {
                    this.el.classList.add("show");
                }
                else {
                    this.el.classList.remove("show");
                }
            },
            enumerable: true,
            configurable: true
        });
        ChatResponse.prototype.setValue = function (dto) {
            if (dto === void 0) { dto = null; }
            this.response = dto ? dto.text : "";
            this.processResponse();
            var text = this.el.getElementsByTagName("text")[0];
            if (!this.visible) {
                this.visible = true;
            }
            if (!this.response || this.response.length == 0) {
                text.setAttribute("thinking", "");
            }
            else {
                text.innerHTML = this.response;
                text.setAttribute("value-added", "");
                text.removeAttribute("thinking");
                // check for if reponse type is file upload...
                if (dto && dto.controlElements && dto.controlElements[0]) {
                    switch (dto.controlElements[0].type) {
                        case "UploadFileUI":
                            text.classList.add("file-icon");
                            var icon = document.createElement("span");
                            icon.innerHTML = cf.Dictionary.get("icon-type-file");
                            text.insertBefore(icon.children[0], text.firstChild);
                            break;
                    }
                }
                if (this.isRobotReponse) {
                    // Robot Reponse ready to ask question.
                    cf.ConversationalForm.illustrateFlow(this, "dispatch", cf.ChatResponseEvents.ROBOT_QUESTION_ASKED, this.response);
                    document.dispatchEvent(new CustomEvent(cf.ChatResponseEvents.ROBOT_QUESTION_ASKED, {
                        detail: this
                    }));
                }
                else if (!this.onClickCallback) {
                    this.el.classList.add("can-edit");
                    this.onClickCallback = this.onClick.bind(this);
                    this.el.addEventListener(cf.Helpers.getMouseEvent("click"), this.onClickCallback, false);
                }
            }
        };
        ChatResponse.prototype.updateThumbnail = function (src) {
            this.image = src;
            var thumbEl = this.el.getElementsByTagName("thumb")[0];
            thumbEl.style.backgroundImage = "url(" + this.image + ")";
        };
        /**
         * skippedBecauseOfEdit
         */
        ChatResponse.prototype.skippedBecauseOfEdit = function () {
            // this.setValue({text: Dictionary.get("ok-editing-previous-answer")});
            this.el.classList.add("disabled");
        };
        /**
        * @name onClickCallback
        * click handler for el
        */
        ChatResponse.prototype.onClick = function (event) {
            cf.ConversationalForm.illustrateFlow(this, "dispatch", cf.ChatResponseEvents.USER_ANSWER_CLICKED, event);
            document.dispatchEvent(new CustomEvent(cf.ChatResponseEvents.USER_ANSWER_CLICKED, {
                detail: this.tag
            }));
        };
        ChatResponse.prototype.processResponse = function () {
            this.response = cf.Helpers.emojify(this.response);
            if (this.tag && this.tag.type == "password" && !this.isRobotReponse) {
                var newStr = "";
                for (var i = 0; i < this.response.length; i++) {
                    newStr += "*";
                }
                this.response = newStr;
            }
        };
        ChatResponse.prototype.setData = function (options) {
            var _this = this;
            this.image = options.image;
            this.response = "";
            this.isRobotReponse = options.isRobotReponse;
            _super.prototype.setData.call(this, options);
            setTimeout(function () {
                _this.setValue();
                if (_this.isRobotReponse) {
                    // Robot is pseudo thinking
                    setTimeout(function () { return _this.setValue({ text: options.response }); }, 0); //ConversationalForm.animationsEnabled ? Helpers.lerp(Math.random(), 500, 900) : 0);
                }
                else {
                    // show the 3 dots automatically
                    setTimeout(function () { return _this.el.classList.add("peak-thumb"); }, cf.ConversationalForm.animationsEnabled ? 1400 : 0);
                }
            }, 0);
        };
        ChatResponse.prototype.dealloc = function () {
            if (this.onClickCallback) {
                this.el.removeEventListener(cf.Helpers.getMouseEvent("click"), this.onClickCallback, false);
                this.onClickCallback = null;
            }
            _super.prototype.dealloc.call(this);
        };
        // template, can be overwritten ...
        ChatResponse.prototype.getTemplate = function () {
            return "<cf-chat-response class=\"" + (this.isRobotReponse ? "robot" : "user") + "\">\n\t\t\t\t<thumb style=\"background-image: url(" + this.image + ")\"></thumb>\n\t\t\t\t<text>" + (!this.response ? "<thinking><span>.</span><span>.</span><span>.</span></thinking>" : this.response) + "</text>\n\t\t\t</cf-chat-response>";
        };
        return ChatResponse;
    }(cf.BasicElement));
    cf.ChatResponse = ChatResponse;
})(cf || (cf = {}));

/// <reference path="ChatResponse.ts"/>
/// <reference path="../BasicElement.ts"/>
/// <reference path="../../logic/FlowManager.ts"/>
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
// namespace
var cf;
(function (cf) {
    // interface
    cf.ChatListEvents = {
        CHATLIST_UPDATED: "cf-chatlist-updated"
    };
    // class
    var ChatList = (function (_super) {
        __extends(ChatList, _super);
        function ChatList(options) {
            var _this = _super.call(this, options) || this;
            // flow update
            _this.flowUpdateCallback = _this.onFlowUpdate.bind(_this);
            document.addEventListener(cf.FlowEvents.FLOW_UPDATE, _this.flowUpdateCallback, false);
            // user input update
            _this.userInputUpdateCallback = _this.onUserInputUpdate.bind(_this);
            document.addEventListener(cf.FlowEvents.USER_INPUT_UPDATE, _this.userInputUpdateCallback, false);
            // user input key change
            _this.onInputKeyChangeCallback = _this.onInputKeyChange.bind(_this);
            document.addEventListener(cf.UserInputEvents.KEY_CHANGE, _this.onInputKeyChangeCallback, false);
            return _this;
        }
        ChatList.prototype.onInputKeyChange = function (event) {
            var dto = event.detail.dto;
            cf.ConversationalForm.illustrateFlow(this, "receive", event.type, dto);
        };
        ChatList.prototype.onUserInputUpdate = function (event) {
            cf.ConversationalForm.illustrateFlow(this, "receive", event.type, event.detail);
            if (this.currentUserResponse) {
                var response = event.detail;
                this.setCurrentResponse(response);
            }
            else {
                // this should never happen..
                throw new Error("No current response ..?");
            }
        };
        ChatList.prototype.onFlowUpdate = function (event) {
            cf.ConversationalForm.illustrateFlow(this, "receive", event.type, event.detail);
            var currentTag = event.detail;
            // robot response
            var robotReponse = "";
            robotReponse = currentTag.question;
            // one way data binding values:
            if (this.flowDTOFromUserInputUpdate) {
                // previous answer..
                robotReponse = robotReponse.split("{previous-answer}").join(this.flowDTOFromUserInputUpdate.text);
            }
            this.createResponse(true, currentTag, robotReponse);
            // user reponse, create the waiting response
            this.createResponse(false, currentTag);
        };
        /**
        * @name onUserAnswerClicked
        * on user ChatReponse clicked
        */
        ChatList.prototype.onUserWantToEditPreviousAnswer = function (tag) {
            console.log(this.constructor.name, 'this.onUserWantToEditPreviousAnswer:', this.currentUserResponse);
            this.currentUserResponse.skippedBecauseOfEdit();
        };
        /**
        * @name setCurrentResponse
        * Update current reponse, is being called automatically from onFlowUpdate, but can also in rare cases be called automatically when flow is controlled manually.
        * reponse: FlowDTO
        */
        ChatList.prototype.setCurrentResponse = function (response) {
            this.flowDTOFromUserInputUpdate = response;
            if (!this.flowDTOFromUserInputUpdate.text) {
                if (response.input.currentTag.type == "group")
                    this.flowDTOFromUserInputUpdate.text = cf.Dictionary.get("user-reponse-missing-group");
                else
                    this.flowDTOFromUserInputUpdate.text = cf.Dictionary.get("user-reponse-missing");
            }
            this.currentUserResponse.setValue(this.flowDTOFromUserInputUpdate);
        };
        ChatList.prototype.updateThumbnail = function (robot, img) {
            cf.Dictionary.set(robot ? "robot-image" : "user-image", robot ? "robot" : "human", img);
            var newImage = robot ? cf.Dictionary.getRobotResponse("robot-image") : cf.Dictionary.get("user-image");
            for (var i = 0; i < this.responses.length; i++) {
                var element = this.responses[i];
                if (robot && element.isRobotReponse) {
                    element.updateThumbnail(newImage);
                }
                else if (!robot && !element.isRobotReponse) {
                    element.updateThumbnail(newImage);
                }
            }
        };
        ChatList.prototype.createResponse = function (isRobotReponse, currentTag, value) {
            var _this = this;
            if (value === void 0) { value = null; }
            var response = new cf.ChatResponse({
                // image: null,
                tag: currentTag,
                isRobotReponse: isRobotReponse,
                response: value,
                image: isRobotReponse ? cf.Dictionary.getRobotResponse("robot-image") : cf.Dictionary.get("user-image"),
            });
            if (!this.responses)
                this.responses = [];
            this.responses.push(response);
            this.currentResponse = response;
            if (!isRobotReponse)
                this.currentUserResponse = this.currentResponse;
            var scrollable = this.el.querySelector("scrollable");
            scrollable.appendChild(this.currentResponse.el);
            // this.el.scrollTop = 1000000000;
            setTimeout(function () {
                document.dispatchEvent(new CustomEvent(cf.ChatListEvents.CHATLIST_UPDATED, {
                    detail: _this
                }));
            }, 0);
        };
        ChatList.prototype.getTemplate = function () {
            return "<cf-chat type='pluto'>\n\t\t\t\t\t\t<scrollable></scrollable>\n\t\t\t\t\t</cf-chat>";
        };
        ChatList.prototype.dealloc = function () {
            document.removeEventListener(cf.FlowEvents.FLOW_UPDATE, this.flowUpdateCallback, false);
            this.flowUpdateCallback = null;
            document.removeEventListener(cf.FlowEvents.USER_INPUT_UPDATE, this.userInputUpdateCallback, false);
            this.userInputUpdateCallback = null;
            document.removeEventListener(cf.UserInputEvents.KEY_CHANGE, this.onInputKeyChangeCallback, false);
            this.onInputKeyChangeCallback = null;
            _super.prototype.dealloc.call(this);
        };
        return ChatList;
    }(cf.BasicElement));
    cf.ChatList = ChatList;
})(cf || (cf = {}));

/// <reference path="../form-tags/Tag.ts"/>
/// <reference path="../ConversationalForm.ts"/>
var cf;
(function (cf) {
    // interface
    cf.FlowEvents = {
        USER_INPUT_UPDATE: "cf-flow-user-input-update",
        USER_INPUT_INVALID: "cf-flow-user-input-invalid",
        //	detail: string
        FLOW_UPDATE: "cf-flow-update",
    };
    // class
    var FlowManager = (function () {
        function FlowManager(options) {
            this.stopped = false;
            this.maxSteps = 0;
            this.step = 0;
            this.savedStep = -1;
            this.stepTimer = 0;
            this.cuiReference = options.cuiReference;
            this.tags = options.tags;
            this.maxSteps = this.tags.length;
            this.userInputSubmitCallback = this.userInputSubmit.bind(this);
            document.addEventListener(cf.UserInputEvents.SUBMIT, this.userInputSubmitCallback, false);
        }
        Object.defineProperty(FlowManager.prototype, "currentTag", {
            get: function () {
                return this.tags[this.step];
            },
            enumerable: true,
            configurable: true
        });
        FlowManager.prototype.userInputSubmit = function (event) {
            var _this = this;
            cf.ConversationalForm.illustrateFlow(this, "receive", event.type, event.detail);
            var appDTO = event.detail;
            var isTagValid = this.currentTag.setTagValueAndIsValid(appDTO);
            var hasCheckedForTagSpecificValidation = false;
            var hasCheckedForGlobalFlowValidation = false;
            var onValidationCallback = function () {
                // check 1
                if (_this.currentTag.validationCallback && typeof _this.currentTag.validationCallback == "function") {
                    if (!hasCheckedForTagSpecificValidation && isTagValid) {
                        hasCheckedForTagSpecificValidation = true;
                        _this.currentTag.validationCallback(appDTO, function () {
                            isTagValid = true;
                            onValidationCallback();
                        }, function (optionalErrorMessage) {
                            isTagValid = false;
                            if (optionalErrorMessage)
                                appDTO.errorText = optionalErrorMessage;
                            onValidationCallback();
                        });
                        return;
                    }
                }
                // check 2, this.currentTag.required <- required should be handled in the callback.
                if (FlowManager.generalFlowStepCallback && typeof FlowManager.generalFlowStepCallback == "function") {
                    if (!hasCheckedForGlobalFlowValidation && isTagValid) {
                        hasCheckedForGlobalFlowValidation = true;
                        // use global validationCallback method
                        FlowManager.generalFlowStepCallback(appDTO, function () {
                            isTagValid = true;
                            onValidationCallback();
                        }, function (optionalErrorMessage) {
                            isTagValid = false;
                            if (optionalErrorMessage)
                                appDTO.errorText = optionalErrorMessage;
                            onValidationCallback();
                        });
                        return;
                    }
                }
                // go on with the flow
                if (isTagValid) {
                    cf.ConversationalForm.illustrateFlow(_this, "dispatch", cf.FlowEvents.USER_INPUT_UPDATE, appDTO);
                    // update to latest DTO because values can be changed in validation flow...
                    appDTO = appDTO.input.getFlowDTO();
                    document.dispatchEvent(new CustomEvent(cf.FlowEvents.USER_INPUT_UPDATE, {
                        detail: appDTO //UserInput value
                    }));
                    // goto next step when user has answered
                    setTimeout(function () { return _this.nextStep(); }, cf.ConversationalForm.animationsEnabled ? 250 : 0);
                }
                else {
                    cf.ConversationalForm.illustrateFlow(_this, "dispatch", cf.FlowEvents.USER_INPUT_INVALID, appDTO);
                    // Value not valid
                    document.dispatchEvent(new CustomEvent(cf.FlowEvents.USER_INPUT_INVALID, {
                        detail: appDTO //UserInput value
                    }));
                }
            };
            // TODO, make into promises when IE is rolling with it..
            onValidationCallback();
        };
        FlowManager.prototype.startFrom = function (indexOrTag) {
            if (typeof indexOrTag == "number")
                this.step = indexOrTag;
            else {
                // find the index..
                this.step = this.tags.indexOf(indexOrTag);
            }
            this.validateStepAndUpdate();
        };
        FlowManager.prototype.start = function () {
            this.stopped = false;
            this.validateStepAndUpdate();
        };
        FlowManager.prototype.stop = function () {
            this.stopped = true;
        };
        FlowManager.prototype.nextStep = function () {
            if (this.savedStep != -1)
                this.step = this.savedStep;
            this.savedStep = -1; //reset saved step
            this.step++;
            this.validateStepAndUpdate();
        };
        FlowManager.prototype.previousStep = function () {
            this.step--;
            this.validateStepAndUpdate();
        };
        FlowManager.prototype.addStep = function () {
            // this can be used for when a Tags value is updated and new tags are presented
            // like dynamic tag insertion depending on an answer.. V2..
        };
        FlowManager.prototype.dealloc = function () {
            document.removeEventListener(cf.UserInputEvents.SUBMIT, this.userInputSubmitCallback, false);
            this.userInputSubmitCallback = null;
        };
        /**
        * @name editTag
        * go back in time and edit a tag.
        */
        FlowManager.prototype.editTag = function (tag) {
            this.savedStep = this.step - 1;
            this.startFrom(tag);
        };
        FlowManager.prototype.skipStep = function () {
            this.nextStep();
        };
        FlowManager.prototype.validateStepAndUpdate = function () {
            if (this.maxSteps > 0) {
                if (this.step == this.maxSteps) {
                    // console.warn("We are at the end..., submit click")
                    this.cuiReference.doSubmitForm();
                }
                else {
                    this.step %= this.maxSteps;
                    this.showStep();
                }
            }
        };
        FlowManager.prototype.showStep = function () {
            if (this.stopped)
                return;
            cf.ConversationalForm.illustrateFlow(this, "dispatch", cf.FlowEvents.FLOW_UPDATE, this.currentTag);
            if (this.currentTag.disabled) {
                // check if current tag has become or is disabled, if it is, then skip step.
                this.skipStep();
            }
            else {
                this.currentTag.refresh();
                document.dispatchEvent(new CustomEvent(cf.FlowEvents.FLOW_UPDATE, {
                    detail: this.currentTag
                }));
            }
        };
        return FlowManager;
    }());
    FlowManager.STEP_TIME = 1000;
    cf.FlowManager = FlowManager;
})(cf || (cf = {}));