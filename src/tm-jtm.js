/*jslint browser: true, devel: true, onevar: true, undef: true, nomen: false, eqeqeq: true, plusplus: true, bitwise: true,
  regexp: true, newcap: true, immed: true */
/*global TM, window, DOMParser, ActiveXObject*/ 

TM.JTM = (function() {
    var ReaderImpl, WriterImpl;

    ReaderImpl = function (tm) {
        this.tm = tm;
        this.defaultDatatype = this.tm.createLocator(TM.XSD.string);
        this.defaultNametype = "http://psi.topicmaps.org/iso13250/model/topic-name";
    };

    /**
    * Imports a JTM topic map or JTM fragment from a JSON-string.
    * name, variant, occurrence and role fragments need the optional parent
    * construct as a parameter.
    *
    * @param {String} str JSON encoded JTM
    * @param {Construct} [parent] Parent construct if the JTM fragment contains
    *        a name, variant, occurrence or role.
    */
    ReaderImpl.prototype.fromString = function (str, parent) {
        var obj = eval(str); // FIXME Use the JSON object instead
        return this.fromObject(obj);
    };

    /**
    * Imports a JTM topic map or JTM fragment.
    * name, variant, occurrence and role fragments need the parent construct
    * as a parameter.
    *
    * @param {object} obj with JTM properties
    * @param {Construct} [parent] Parent construct if the JTM fragment contains
    *        a name, variant, occurrence or role.
    */
    ReaderImpl.prototype.fromObject = function (obj, parent) {
        var ret;
        if (obj.version !== '1.0') {
            throw {name: 'InvalidFormat',
                message: 'Unknown version of JTM'};
        }
        switch (obj.item_type) {
            case "topicmap": ret = this.parseTopicMap(obj); break;
            case "topic": ret = this.parseTopic(obj); break;
            case "name": ret = this.parseName(parent, obj); break;
            case "variant": ret = this.parseVariant(parent, obj); break;
            case "occurrence": ret = this.parseOccurrence(parent, obj); break;
            case "association": ret = this.parseAssociation(obj); break;
            case "role": ret = this.parseRole(parent, obj); break;
            default: throw {name: 'InvalidFormat',
                message: 'Unknown item_type property'};
        }
        return ret;
    };

    ReaderImpl.prototype.parseTopicMap = function (obj) {
        var i, len, arr;
        if (obj.topics && typeof obj.topics === 'object' && obj.topics instanceof Array) {
            arr = obj.topics;
            len = arr.length;
            for (i = 0; i < len; i+= 1) {
                this.parseTopic(arr[i]);
            }
            arr = null;
        }
        if (obj.associations && typeof obj.associations === 'object' &&
            obj.associations instanceof Array) {
            arr = obj.associations;
            len = arr.length;
            for (i = 0; i < len; i+= 1) {
                this.parseAssociation(arr[i]);
            }
            arr = null;
        }
        return true;
    };

    ReaderImpl.prototype.parseTopic = function (obj) {
        var topic = null, parseIdentifier, arr, i;
        parseIdentifier = function (tm, topic, arr, createFunc, addFunc) {
            var i, len;
            if (arr && typeof arr === 'object' && arr instanceof Array) {
                len = arr.length;
                for (i = 0; i < len; i += 1) {
                    if (!topic) {
                        topic = createFunc.apply(tm, [tm.createLocator(arr[i])]);
                    } else {
                        topic[addFunc](tm.createLocator(arr[i]));
                    }
                }
            }
            return topic;
        };
        topic = parseIdentifier(this.tm, topic, obj.subject_identifiers,
            this.tm.createTopicBySubjectIdentifier, 'addSubjectIdentifier');
        topic = parseIdentifier(this.tm, topic, obj.subject_locators,
            this.tm.createTopicBySubjectLocator, 'addSubjectLocator');
        topic = parseIdentifier(this.tm, topic, obj.item_identifiers,
            this.tm.createTopicByItemIdentifier, 'addItemIdentifier');

        arr = obj.names;
        if (arr && typeof arr === 'object' && arr instanceof Array) {
            for (i = 0; i < arr.length; i += 1) {
                this.parseName(topic, arr[i]);
            }
        }
        arr = obj.occurrences;
        if (arr && typeof arr === 'object' && arr instanceof Array) {
            for (i = 0; i < arr.length; i += 1) {
                this.parseOccurrence(topic, arr[i]);
            }
        }

        this.parseItemIdentifiers(topic, obj.item_identifiers);
    };

    ReaderImpl.prototype.parseName = function (parent, obj) {
        var name, type, scope, arr, i;
        scope = this.parseScope(obj.scope);
        type = this.getTopicByReference(obj.type);
        name = parent.createName(obj.value, type ? type : this.defaultNametype, scope);
        arr = obj.variants;
        if (arr && typeof arr === 'object' && arr instanceof Array) {
            this.parseVariant(name, arr[i]);
        }
        this.parseItemIdentifiers(name, obj.item_identifiers);
        this.parseReifier(name, obj.reifier);
    };

    ReaderImpl.prototype.parseVariant = function (parent, obj) {
        var variant, type, scope;
        scope = this.parseScope(obj.scope);
        variant = parent.createVariant(obj.value, 
            obj.datatype ? this.tm.createLocator(obj.datatype) : this.defaultDatatype, scope);
        this.parseItemIdentifiers(variant, obj.item_identifiers);
        this.parseReifier(variant, obj.reifier);
    };

    ReaderImpl.prototype.parseOccurrence = function (parent, obj) {
        var occurrence, type, scope;
        scope = this.parseScope(obj.scope);
        type = this.getTopicByReference(obj.type);
        occurrence = parent.createOccurrence(type, obj.value,
            obj.datatype ? this.tm.createLocator(obj.datatype) : this.defaultDatatype, scope);
        this.parseItemIdentifiers(occurrence, obj.item_identifiers);
        this.parseReifier(occurrence, obj.reifier);
    };

    ReaderImpl.prototype.parseAssociation = function (obj) {
        var association, type, scope, arr, i;
        scope = this.parseScope(obj.scope);
        type = this.getTopicByReference(obj.type);
        association = this.tm.createAssociation(type, scope);
        arr = obj.roles;
        if (arr && typeof arr === 'object' && arr instanceof Array) {
            for (i = 0; i < arr.length; i += 1) {
                this.parseRole(association, arr[i]);
            }
        }
        this.parseItemIdentifiers(association, obj.item_identifiers);
        this.parseReifier(association, obj.reifier);
    };

    ReaderImpl.prototype.parseRole = function (parent, obj) {
        var role, type, player, scope;
        type = this.getTopicByReference(obj.type);
        player = this.getTopicByReference(obj.player);
        role = parent.createRole(type, player);
        this.parseItemIdentifiers(role, obj.item_identifiers);
        this.parseReifier(role, obj.reifier);
    };

    ReaderImpl.prototype.parseScope = function (arr) {
        var i, scope = [];
        if (arr && typeof arr === 'object' && arr instanceof Array) {
            for (i = 0; i < arr.length; i += 1) {
                scope.push(this.getTopicByReference(arr[i]));
            }
        }
        return scope;
    };

    /**
    * Internal function that takes a JTM-identifier string as a parameter
    * and returns a topic object - either an existing topic or a new topic
    * if the requested topic did not exist
    * @param {String} locator JTM-identifier
    */
    ReaderImpl.prototype.getTopicByReference = function (locator) {
        if (typeof locator === 'undefined' || locator === null) {
            return null;
        }
        switch(locator.substr(0, 3)) {
            case 'si:' : return this.tm.createTopicBySubjectIdentifier(
                this.tm.createLocator(locator.substr(3)));
            case 'sl:' : return this.tm.createTopicBySubjectLocator(
                this.tm.createLocator(locator.substr(3)));
            case 'ii:' : return this.tm.createTopicByItemIdentifier(
                this.tm.createLocator(locator.substr(3)));
        }
        throw {name: 'InvalidFormat',
            message: 'Invaild topic reference \''+locator+'\''};
    };

    ReaderImpl.prototype.parseItemIdentifiers = function (construct, arr) {
        var i;
        if (arr && typeof arr === 'object' && arr instanceof Array) {
            for (i = 0; i < arr.length; i += 1) {
                construct.addItemIdentifier(construct.getTopicMap().createLocator(arr[i]));
            }
        }
    };

    ReaderImpl.prototype.parseReifier = function (construct, reifier) {
        var reifierTopic = this.getTopicByReference(reifier);
        construct.setReifier(reifierTopic);
    };

    WriterImpl = function (tm) {
        var that = this;
        this.tm = tm;
        this.defaultDatatype = this.tm.createLocator(TM.XSD.string);
        this.defaultNametype = "http://psi.topicmaps.org/iso13250/model/topic-name";
        this.exportIdentifiers = function (obj, arr, attr) {
            var i, len = arr.length;
            if (len > 0) {
                obj[attr] = [];
                for (i = 0; i < len; i += 1) {
                    obj[attr].push(arr[i].getReference());
                }
            }
        
        }; 
        this.exportScope = function (obj, construct) {
            var i, arr = construct.getScope();
            if (arr.length > 0) {
                obj.scope = [];
                for (i = 0; i < arr.length; i += 1) {
                    obj.scope.push(that.getTopicReference(arr[i]));
                }
            }
        };
    };

    WriterImpl.prototype.toObject = function (construct) {
        var arr, i, len, obj;
        if (!construct.isTopicMap()) {
            throw {name: 'TmjsException', message: 'JTM-export of constructs other than TopicMap is not implemented'};
        }
        obj = {
            version: '1.0',
            item_type: 'topicmap',
            topics: [],
            associations: []
        };
        if (construct.getReifier()) {
            obj.reifier = this.getTopicReference(construct.getReifier());
        }
        arr = construct.getTopics();
        len = arr.length;
        for (i = 0; i < len; i += 1) {
            obj.topics.push(this.exportTopic(arr[i]));
        }
        arr = construct.getAssociations();
        len = arr.length;
        for (i = 0; i < len; i += 1) {
            obj.associations.push(this.exportAssociation(arr[i]));
        }
        return obj;
    };

    WriterImpl.prototype.exportTopic = function (t) {
        var arr, i, len, obj;
        obj = {};
        this.exportIdentifiers(obj, t.getSubjectIdentifiers(), 'subject_identifiers');
        this.exportIdentifiers(obj, t.getSubjectLocators(), 'subject_locators');
        this.exportIdentifiers(obj, t.getItemIdentifiers(), 'item_identifiers');
        arr = t.getNames();
        len = arr.length;
        if (len > 0) {
            obj.names = [];
            for (i = 0; i < len; i += 1) {
                obj.names.push(this.exportName(arr[i]));
            }
        }
        arr = t.getOccurrences();
        len = arr.length;
        if (len > 0) {
            obj.occurrences = [];
            for (i = 0; i < len; i += 1) {
                obj.occurrences.push(this.exportOccurrence(arr[i]));
            }
        }
        return obj;
    };

    WriterImpl.prototype.exportName = function (name) {
        var arr, i, len, obj, tmp;
        obj = {
            'value': name.getValue()
        };
        tmp = name.getType();
        if (tmp) { obj.type = this.getTopicReference(tmp); }
        tmp = name.getReifier();
        if (tmp) { obj.reifier = this.getTopicReference(tmp); }
        
        this.exportIdentifiers(obj, name.getItemIdentifiers(), 'item_identifiers');
        this.exportScope(obj, name);
        arr = name.getVariants();
        len = arr.length;
        if (len > 0) {
            obj.variants = [];
            for (i = 0; i < len; i += 1) {
                obj.variants.push(this.exportVariant(arr[i]));
            }
        }
        return obj;
    };

    WriterImpl.prototype.exportVariant = function (variant) {
        var arr, i, len, obj, tmp;
        obj = {
            'value': variant.getValue()
        };
        tmp = variant.getDatatype();
        if (tmp && tmp !== this.defaultDatatype) {
            obj.datatype = tmp.getReference();
        }
        tmp = variant.getReifier();
        if (tmp) { obj.reifier = this.getTopicReference(tmp); }
        
        this.exportIdentifiers(obj, variant.getItemIdentifiers(), 'item_identifiers');
        this.exportScope(obj, variant);
    };

    WriterImpl.prototype.exportOccurrence = function (occ) {
        var arr, i, len, obj, tmp;
        obj = {
            value: occ.getValue(),
            type: this.getTopicReference(occ.getType())
        };
        tmp = occ.getDatatype();
        if (tmp && tmp !== this.defaultDatatype) {
            obj.datatype = tmp.getReference();
        }
        tmp = occ.getReifier();
        if (tmp) { obj.reifier = this.getTopicReference(tmp); }
        
        this.exportIdentifiers(obj, occ.getItemIdentifiers(), 'item_identifiers');
        this.exportScope(obj, occ);
        return obj;
    };

    WriterImpl.prototype.exportAssociation = function (association) {
    /*
    ▪   roles - an non-empty array of Roles required
    */
        var arr, i, obj, tmp;
        obj = {
            type: this.getTopicReference(association.getType()),
            roles: []
        };
        tmp = association.getReifier();
        if (tmp) { obj.reifier = this.getTopicReference(tmp); }
        this.exportIdentifiers(association, association.getItemIdentifiers(), 'item_identifiers');
        this.exportScope(obj, association);
        arr = association.getRoles();
        for (i = 0; i < arr.length; i += 1) {
            obj.roles.push(this.exportRole(arr[i]));
        }
        return obj;
    };

    WriterImpl.prototype.exportRole = function (role) {
        var arr, i, obj, tmp;
        obj = {
            player: this.getTopicReference(role.getPlayer()),
            type: this.getTopicReference(role.getType())
        };
        tmp = role.getReifier();
        if (tmp) { obj.reifier = this.getTopicReference(tmp); }
        this.exportIdentifiers(obj, role.getItemIdentifiers(), 'item_identifiers');
        return obj;
    };

    /**
    * Generates a JTM reference based on the topics subject identifier,
    * subject locator or item identifier (whatever is set, tested in this
    * order).
    * @returns {string} Representing the topic t, e.g.
    *     "si:http://psi.topicmaps.org/iso13250/model/type
    */
    WriterImpl.prototype.getTopicReference = function (t) {
        var arr;
        arr = t.getSubjectIdentifiers();
        if (arr.length > 0) {
            return 'si:'+arr[0].getReference();
        }
        arr = t.getSubjectLocators();
        if (arr.length > 0) {
            return 'sl:'+arr[0].getReference();
        }
        arr = t.getItemIdentifiers();
        if (arr.length > 0) {
            return 'ii:'+arr[0].getReference();
        }
        // ModelConstraintExeption: TMDM says that t MUST have on of these
    };

    return {
        Reader: ReaderImpl,
        Writer: WriterImpl
    };
}());
