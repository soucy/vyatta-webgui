/* 
 * To change this template, choose Tools | Templates
 * and open the template in the editor.
 */

function f_sendOperationCliCommand(node, callbackObj, clear, prevXMLStr, 
                                    forceSend, segmentId, treeObj, wildCard)
{
    var narr = [ ];
    var n = node;
    var sendStr = '';
    var headerStr = '';

    if(n != undefined)
    {
        /////////////////////////////////////////////////
        // construct a sent command by on the given node
        while(n.text != 'Operation')
        {
            if(n.text == '&lt;value&gt;')
            {
                if(n.getValFunc != undefined)
                {
                    var val = n.getValFunc();
                    if(forceSend && (val == "'Select a valuid value...'" ||
                        val == "''"))
                    {
                        f_promptErrorMessage('Input Error!',
                                            'Please enter a valid value.');
                        return "";
                    }

                    if(!forceSend || (val == "'Select a valuid value...'" ||
                            val == "''"))
                        return "";  // nothing to send.

                    narr.push(val);
                }
                else if(!forceSend)
                    return "";  // nothing to send
                else
                    narr.push("<Value>");
            }
            else
                narr.push(n.text);

            n = n.parentNode;
        }

        while(narr.length > 0)
        {
            var c = narr.pop();
            sendStr += (c + ' ');

            if(headerStr.length > 1)
                headerStr += '&nbsp;&rArr;&nbsp;';
            headerStr += c;
        }
        
        g_cliCmdObj.m_node = node;
        if(segmentId != undefined)
            sendStr = segmentId;
        else
            g_cliCmdObj.m_sendCmdWait = Ext.MessageBox.wait(
                            'Running operational command...', 'Operation');
        g_cliCmdObj.m_cb = callbackObj;
        g_cliCmdObj.m_segmentId = undefined;
    }
    else if(segmentId != undefined)
    {
        sendStr = segmentId
        g_cliCmdObj.m_cb = callbackObj;
        g_cliCmdObj.m_segmentId = undefined;
    }
    else
    {
        sendStr = prevXMLStr;
        g_cliCmdObj.m_sendCmdWait = Ext.MessageBox.wait(
                            'Processing', 'Command');
    }

    //////////////////////////////////////////////////////////////
    // operaction command callback
    var opCmdCb = function(options, success, response)
    {
        if(!f_isResponseOK(response))
        {
            f_hideSendWaitMessage();
            return;
        }

        // if tab had changed, we ingore respond
        if(g_cliCmdObj.m_segmentId == 'tabChanged') return;

        var xmlRoot = response.responseXML.documentElement;
        var isSuccess = f_parseResponseError(xmlRoot);
        g_cliCmdObj.m_segmentId = (isSuccess[2] != undefined)?isSuccess[2]:null;
        var sId = g_cliCmdObj.m_segmentId;

        if(sendStr == 'reboot ')
            isSuccess[1] = 'System is rebooting. Please wait for reboot to complete\n'+
                            'then refresh the browser to log in again.';
        /////////////////////////////////////
        // handle the 'Load' toolbar command
        if(wildCard != undefined && wildCard[0] != undefined &&
            wildCard[0].indexOf('show files ') >= 0)
        {
            g_cliCmdObj.m_wildCard = wildCard;
            g_cliCmdObj.m_node = null;
            g_cliCmdObj.m_treeObj = treeObj;

            if(sId.indexOf('_end') >= 0)
            {
                f_hideSendWaitMessage();
                f_showFileChooserDialog(wildCard[1], g_cliCmdObj.m_wildCard[2], treeObj);
            }
            else if(g_cliCmdObj.m_wildCard[2] == undefined)
                g_cliCmdObj.m_wildCard[2] = isSuccess[1];
            else
                g_cliCmdObj.m_wildCard[2] += isSuccess[1] + "\n";

            return;
        }
        else if(isSuccess[0] && sId != undefined && sId.indexOf('_end') < 0)
        {
            if(wildCard != undefined && typeof wildCard.setText == 'function')
            {
                wildCard.setText('Stop');
                wildCard.el.dom.className = V_WAIT_CSS;
            }
            g_cliCmdObj.m_wildCard = wildCard;
        }
        else if(sId != undefined && sId.indexOf('_end') >= 0 &&
            g_cliCmdObj.m_wildCard != undefined &&
            g_cliCmdObj.m_wildCard.text != undefined)
        {
            if(wildCard != undefined && typeof wildCard.setText == 'function')
            {
                var wc = g_cliCmdObj.m_wildCard;
                wc.setText('Run');
                wc.el.dom.className = V_STOP_CSS;
                wc.m_pauseBtn.setText('Pause');
                wc.m_pauseBtn.hide();
            }
        }
        

        //////////////////////////////////////////////////////////
        // update editor view
        callbackObj.f_updateOperCmdResponse(headerStr,
                    isSuccess[1], clear);

        f_hideSendWaitMessage();
    }

    var sid = f_getUserLoginedID();
    f_saveUserLoginId(sid);

    /* send request */
    var xmlstr = "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n"
               + "<vyatta><command><id>" + sid + "</id>\n"
               + "<statement mode='op'>" + sendStr + "</statement>\n"
               + "</command></vyatta>\n";

    g_cliCmdObj.m_newSegmentId = xmlstr.indexOf('multi_') >= 0 ? false : true;


    //////////////////////////////////////////////////////////////////
    // avoid to send a duplicate command again
    if(prevXMLStr != undefined && prevXMLStr == xmlstr)
        return xmlstr;

    var conn = new Ext.data.Connection({});
    conn.request(
    {
        url: '/cgi-bin/webgui-wrap',
        method: 'POST',
        xmlData: xmlstr,
        callback: opCmdCb
    });

    return xmlstr;
}

function f_sendConfigCLICommand(cmds, treeObj, node, isCreate)
{
    g_cliCmdObj.m_sendCmdWait = Ext.MessageBox.wait('Changing configuration...',
                                                      'Configuration');

    var tObj = treeObj;
    var sendCommandCliCb = function(options, success, response)
    {
        f_hideSendWaitMessage();
        if(!f_isResponseOK(response))
            return;

        var xmlRoot = response.responseXML.documentElement;
        var isSuccess = f_parseResponseError(xmlRoot);
        if(!isSuccess[0])
        {
            var err = f_replace(isSuccess[1], "\r\n", "<br>");
            f_promptErrorMessage('Changing configuration...', err);
            
            /////////////////////////////////
            // handle input error
            f_handleInputFieldError(node);

            ///////////////////////////////////////////
            // if commit error, flag error for tree
            if(cmds[0].indexOf('commit') < 0)
                return;
        }


        var tree = tObj.m_tree;
        var selNode = tree.getSelectionModel().getSelectedNode();
        if(selNode == undefined)
            selNode = tree.getRootNode();
        var selPath = selNode.getPath('text');


        /////////////////////////////////////
        if(cmds[0].indexOf('load') == 0)
        {
            tree.root.reload();
            tObj.m_parent.f_cleanEditorPanel();
        }
        if(cmds[0].indexOf('save') >= 0)
        {
            f_promptErrorMessage('Save configuration', isSuccess[1],
                                  Ext.MessageBox.INFO);
        }
        else if(cmds[0].indexOf('discard') >= 0)
        {
            g_cliCmdObj.m_commitErrs = [];
            var onReloadHandler = function()
            {
                tObj.m_parent.f_cleanEditorPanel();
                f_handleNodeExpansion(tObj, selNode, selPath, cmds[0]);
                tree.un('load', onReloadHandler);
            }
            tree.on('load', onReloadHandler);
            tree.root.reload();
        }
        else if(cmds[0].indexOf('commit') >= 0)
        {
            var onReloadHandler = function()
            {
                tObj.m_parent.f_cleanEditorPanel();
                f_handleNodeExpansion(tObj, selNode, selPath, cmds[0]);
                tree.un('load', onReloadHandler);
            }
            tObj.m_parent.f_resetEditorPanel();
            tObj.m_selNodePath = selPath;//node.parentNode;
            tree.on('load', onReloadHandler);
            tree.getRootNode().reload();
        }
        /////////////////////////////////////
        // handle the 'View' toolbar command
        else if(cmds[0] == 'show session')
        {
            f_handleToolbarViewCmdResponse(isSuccess[1]);
            return;
        }
        else  // other things else
        {
            if(node == undefined)
                f_handleNodeExpansion(tObj, selNode, selPath, cmds);
            else if(node.parentNode != undefined || selNode.parentNode != undefined)
                f_handleParentNodeExpansion(tObj, node, selNode, selPath, cmds, isCreate);
        }
    } // end of callback

    var sid = f_getUserLoginedID();
    f_saveUserLoginId(sid);
    f_updateCommitErrors(node);
    var xmlstr = "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n"
                   + "<vyatta><command><id>" + sid + "</id>\n";

    for(var i = 0; i < cmds.length; i++)
        xmlstr += "<statement mode='conf'>" + cmds[i] + "</statement>\n";
    xmlstr += "</command></vyatta>\n";

    g_cliCmdObj.m_segmentId = undefined;
    var conn = new Ext.data.Connection({});
    conn.request(
    {
        url: '/cgi-bin/webgui-wrap',
        method: 'POST',
        xmlData: xmlstr,
        callback: sendCommandCliCb
    });
}

function f_isResponseOK(response)
{
    if(!f_isLogined()) return true;

    var msg = 'Please refresh GUI and try again later.';
    var ret = false;

    if(response.responseXML == undefined ||
            response.status == 408 /* request timeout */)
        f_promptErrorMessage('Request timeout!',
              'Request to the service failed in the time allowed by the server. ' +
              msg);
    else if(response.status == 500)
          f_promptErrorMessage('Internal Server Error!',
              'Server had a problem either getting data or parsing the results. ' +
              msg);
    else if(response.status == 503)
        f_promptErrorMessage('Service Unavailable!',
              'Web service had a temporary overload and count not process the request. ' +
              msg);
    else if(response.status == 200)
        ret = true;
    else
        f_promptErrorMessage('Service Unavailable!', 'Unkown error. ' + msg);

    return ret;
}

function f_handleNodeExpansion(treeObj, selNode, selPath, cmds)
{
    var tree = treeObj.m_tree;

    //////////////////////////////////////////////
    // expand handler
    var ehandler = function(success, last)
    {
        var lSelPath = last.getPath('text');

        if(lSelPath != selPath)
        {
            if(cmds == 'discard')
            {
                tree.selectPath(lSelPath, 'text');
                treeObj.m_selNodePath = lSelPath;
                selPath = lSelPath;
            }

            // we were at leaf. "last" is parent.
            tree.selectPath(selPath, 'text', function(success, sel)
            {
                var nnode = treeObj.m_tree.getSelectionModel().getSelectedNode();
                treeObj.f_HandleNodeConfigClick(nnode, null, undefined, treeObj);
            });
        }
        else
        {
            tree.selectPath(selPath, 'text');
            treeObj.f_HandleNodeConfigClick(last, null, undefined, treeObj);
        }
    }

    //////////////////////////////////////////////////////
    // expand node
    var p = tree.root;
    var handler = function(narg)
    {
        tree.expandPath(selPath, 'text', ehandler);
        narg.un('expand', handler);
    }
    p.collapse();
    p.on('expand', handler);
    p.expand();
}

function f_handleParentNodeExpansion(treeObj, node, selNode, selPath, cmds, isCreate)
{
    if(node.parentNode == undefined)
        node.parentNode = selNode;

    var tree = treeObj.m_tree;
    treeObj.m_selNodePath = selPath;
    var p = node.parentNode;
    var doNotClear = false;

    if(isCreate)
    {
        treeObj.m_isCommitAvailable = true;

        ////////////////////////////////////////////////
        // if 'node' has not fresh from server, we flag
        // it as 'set' here to sync with server
        //if(node.attributes.configured == undefined)
        node.attributes.configured = 'set'

        /*
         * new we need to walk up the tree to flag the yellow cir.
         * Anything below the parent node automatically took care
         * by the server.
         */
        f_handlePropagateParentNodes(node);
        var skipClearChk = false;
        if(node != undefined && typeof node.reload == 'function')
        {
            skipClearChk = true;
            node.reload();
        }
        else if(selNode != undefined && typeof selNode.reload == 'function')
            selNode.reload();

        ////////////////////////////////////////////////////////
        // if spath == scmd, creation is from push button, else
        // creation is from input fields.
        var spath = selPath.replace('Configuration', '');
        var scmd = cmds[0].replace('set', '');
        spath = f_replace(spath, ' ', '');
        scmd = f_replace(scmd, ' ', '');
        if(spath == scmd)
        {
            p = node;
            selNode = p;
            selPath = p.getPath('text');
        }
        else
            doNotClear = skipClearChk ? doNotClear : true;
    }
    else if(cmds[0].indexOf("delete", 0) >= 0)
    {
        treeObj.m_cmd = cmds[0].substring(0, 6);

        ///////////////////////////////////////////
        // the selected node should have been
        // deleted. set the new selected node here.
        var sm = tree.getSelectionModel();
        sm.select(selNode.parentNode);
        treeObj.m_selNodePath = sm.getSelectedNode().getPath('text');
        
        var nnode = sm.getSelectedNode();
        selNode = nnode;
        selPath = nnode.getPath('text');

        if(nnode.attributes != undefined)
            nnode.attributes.configured = 'active_plus';

        nnode.reload();
        treeObj.m_isCommitAvailable = true;
        f_handlePropagateParentNodes(nnode);
        treeObj.m_parent.f_onTreeRenderer(treeObj);
    }

    ////////////////////////////////////////////////////////
    // refresh the editor panel on the selectioned node
    var handler = function(narg)
    {
        tree.selectPath(selPath, 'text', function(success, sel)
        {
            var nnode = tree.getSelectionModel().getSelectedNode();

            if(!doNotClear)
                treeObj.m_parent.f_cleanEditorPanel();
            treeObj.f_HandleNodeConfigClick(nnode, null, undefined, treeObj);
        });

        narg.un('expand', handler);
    }
    if(!f_isExpandableNode(p))
        treeObj.m_parent.f_onTreeRenderer(treeObj);
    if(p.expanded)
        p.collapse();
    p.on('expand', handler);
    p.expand();
        
}

function f_handlePropagateParentNodes(node)
{
    var n = node;

    while(n != undefined)
    {
        /////////////////////////////////////////////
        // mark node as dirty.
        if(n.ui.elNode != undefined)
        {
            var inner = n.ui.elNode.innerHTML;
            
            if(inner.indexOf(V_DIRTY_FLAG) < 0)
            {
                var flag = V_IMG_EMPTY;
                //var f = getNodeStyleImage(n, true);
                //alert(n.text + '=' + f + '=' + n.attributes.configured)
                switch(getNodeStyleImage(n, true))
                {
                    case V_DIRTY_FLAG_ADD:
                        flag = V_IMG_DIRTY_ADD;
                        break;
                    case V_DIRTY_FLAG_DEL:
                        flag = V_IMG_DIRTY_DEL;
                        break;
                    case V_DIRTY_FLAG:
                        flag = V_IMG_DIRTY;
                        break;
                    case V_ERROR_FLAG:
                        flag = V_IMG_ERR;
                        break;
                }
                f_setNodeFlag(n, flag);
            }
        }

        var prev = n;
        n.attributes.configured = 'set';
        n = n.parentNode;

        ////////////////////////////////////////////////
        // if child is dirty, flag parent as dirty as well.
        if(n != undefined && n.attributes.configured != undefined &&
            n.attributes.configured == 'active')
            n.attributes.configured = 'active_plus';
        else if(n != undefined && n.attributes.configured == undefined)
            n.attributes.configured = 'set';
    }
}

function f_parseResponseError(xmlRoot)
{
    var success = true;
    var q = Ext.DomQuery;
    var err = q.selectNode('error', xmlRoot);
    var msg = '', code = 0, segment = undefined;

    if(err != undefined)
    {
        code = q.selectValue('code', err, 'UNKNOWN');
        msg = q.selectValue('msg', err, 'UNKNOWN');

        //////////////////////////////////////////////
        // selectValue only can return up to 4096 char
        if(msg.length >= 4096 && xmlRoot.textContent != undefined)
        {
            msg = xmlRoot.textContent;

            // strip out the first 1 extra chars.
            msg = msg.substr(1, msg.length);
        }

        var msgNode = q.selectNode('msg', err);
        segment = msgNode.getAttribute('segment');

        switch(code)
        {
            default:
            case "6": // input error
                success = false;
                break;
            case "0":
                success = true;
                break;
            case "3":
                f_promptUserNotLoginMessage();
                if(f_isAutoLogin())
                    f_autoLogin();
                else
                    f_userLogout(true, g_baseSystem.m_homePage);
                break;
            case "4":  //permission level is not valid
                msg = 'operator permission';
                success = true;
                break;
            case "9":
                success = false;
                f_parseCommitErrors(msg);
                msg = "Additional configuration information is required.";

        }
            
        if(msg == 'UNKNOWN')
            msg = '';
    }

    return [ success, msg, segment];
}

function f_parseCommitErrors(err)
{
    var reg = "\r\n";
    var errs = '';
    if(Ext.isIE)
    {
        errs = f_replace(errs, "\r", "");
        reg = "\n";
    }
    errs = err.split(reg);
    g_cliCmdObj.m_commitErrs = [];

    for(var i=0; i<errs.length; i++)
        g_cliCmdObj.m_commitErrs[i] = errs[i].split("/");
}

function f_updateCommitErrors(node)
{
    var errs = g_cliCmdObj.m_commitErrs;

    if(errs != null)
    {
        for(var i=0; i<errs.length; i++)
        {
            var err = errs[i];
            for(var j=0; j<err.length; j++)
                if(node != null && node.text == err[j])
                {
                    if(Ext.isIE)
                        g_cliCmdObj.m_commitErrs[i] = "";
                    else
                        g_cliCmdObj.m_commitErrs[i] = [];

                    return;
                }
        }
    }
}

function f_isCommitError(node)
{
    var cErrs = g_cliCmdObj.m_commitErrs;
    if(cErrs != undefined)
    {
        for(var i=0; i<cErrs.length; i++)
        {
            var errs = cErrs[i];
            for(var j=0; j<errs.length; j++)
            {
                if(errs[j] == node.text)
                {
                    ////////////////////////
                    // if node is top level
                    if(j == 0 || j == 1)
                        return true;

                    ////////////////////////////
                    // if node is not top level,
                    // more check to makesure its
                    // a node we expected.
                    if(node.parentNode != null)
                        if(node.parentNode.text == errs[j-1])
                            return true;
                }
            }
        }
    }

    return false;
}

function f_startSegmentCommand()
{
    g_cliCmdObj.m_segPause = false;

    Ext.TaskMgr.start(
    {
        run: function()
        {
            if(g_cliCmdObj.m_segmentId != undefined &&
                    (g_cliCmdObj.m_segmentId.indexOf("_end") >= 0 ||
                    g_cliCmdObj.m_segmentId == 'tabChanged'))
            {
                g_cliCmdObj.m_segmentId = undefined;  // end this segment run
                g_cliCmdObj.m_segPause = false;
            }

            if(g_cliCmdObj.m_segmentId != undefined &&
                !g_cliCmdObj.m_segPause)
            {
                f_sendOperationCliCommand(g_cliCmdObj.m_node, g_cliCmdObj.m_cb,
                                    false, undefined, true,
                                    g_cliCmdObj.m_segmentId,
                                    g_cliCmdObj.m_treeObj,
                                    g_cliCmdObj.m_wildCard);
            }
        }
        ,interval: 1500
    });
}