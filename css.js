/*
 * css! loader plugin
 * Allows for loading stylesheets with the 'css!' syntax.
 *
 * External stylesheets supported.
 * 
 * '!' suffix skips load checking
 *
 */
define(['./normalize'], function(normalize) {
  if (typeof window == 'undefined')
    return { load: function(n, r, load){ load() } };
  
  var head = document.getElementsByTagName('head')[0];
  
  
  /* XHR code - copied from RequireJS text plugin */
  var progIds = ['Msxml2.XMLHTTP', 'Microsoft.XMLHTTP', 'Msxml2.XMLHTTP.4.0'];
  var fileCache = {};
  var get = function(url, callback, errback) {
    if (fileCache[url]) {
      callback(fileCache[url]);
      return;
    }

    var xhr, i, progId;
    if (typeof XMLHttpRequest !== 'undefined')
      xhr = new XMLHttpRequest();
    else if (typeof ActiveXObject !== 'undefined')
      for (i = 0; i < 3; i += 1) {
        progId = progIds[i];
        try {
          xhr = new ActiveXObject(progId);
        }
        catch (e) {}
  
        if (xhr) {
          progIds = [progId];  // so faster next time
          break;
        }
      }
    
    xhr.open('GET', url, requirejs.inlineRequire ? false : true);
  
    xhr.onreadystatechange = function (evt) {
      var status, err;
      //Do not explicitly handle errors, those should be
      //visible via console output in the browser.
      if (xhr.readyState === 4) {
        status = xhr.status;
        if (status > 399 && status < 600) {
          //An http 4xx or 5xx error. Signal an error.
          err = new Error(url + ' HTTP status: ' + status);
          err.xhr = xhr;
          errback(err);
        }
        else {
          fileCache[url] = xhr.responseText;
          callback(xhr.responseText);
        }
      }
    };
    
    xhr.send(null);
  }
  
  //main api object
  var cssAPI = {};
  
  cssAPI.pluginBuilder = './css-builder';
  
  //<style> tag creation
  var stylesheet = document.createElement('style');
  stylesheet.type = 'text/css';
  head.appendChild(stylesheet);
  
  if (stylesheet.styleSheet)
    cssAPI.inject = function(css) {
      stylesheet.styleSheet.cssText += css;
    }
  else
    cssAPI.inject = function(css) {
      stylesheet.appendChild(document.createTextNode(css));
    }

  cssAPI.inspect = function() {
    if (stylesheet.styleSheet)
      return stylesheet.styleSheet.cssText;
    else if (stylesheet.innerHTML)
      return stylesheet.innerHTML;
  }
  
  var instantCallbacks = {};
  cssAPI.normalize = function(name, normalize) {
    var instantCallback;
    if (name.substr(name.length - 1, 1) == '!')
      instantCallback = true;
    if (instantCallback)
      name = name.substr(0, name.length - 1);
    if (name.substr(name.length - 4, 4) == '.css')
      name = name.substr(0, name.length - 4);
    
    name = normalize(name);
    
    if (instantCallback)
      instantCallbacks[name] = instantCallback;
    
    return name;
  }

  // NB add @media query support for media imports
  var importRegEx = /@import\s*(url)?\s*(('([^']*)'|"([^"]*)")|\(('([^']*)'|"([^"]*)"|([^\)]*))\))\s*;?/g;

  var pathname = window.location.pathname.split('/');
  pathname.pop();
  pathname = pathname.join('/') + '/';

  var loadCSS = function(fileUrl, callback) {

    //make file url absolute
    if (fileUrl.substr(0, 1) != '/')
      fileUrl = '/' + normalize.convertURIBase(fileUrl, pathname, '/');

    get(fileUrl, function(css) {

      // normalize the css (except import statements)
      css = normalize(css, fileUrl, pathname);

      // detect all import statements in the css and normalize
      var importUrls = [];
      var importIndex = [];
      var importLength = [];
      var match;
      while (match = importRegEx.exec(css)) {
        var importUrl = match[4] || match[5] || match[7] || match[8] || match[9];

        // normalize the import url
        if (importUrl.indexOf('.') == -1)
          importUrl += '.less';
        // only normalize relative paths
        if (importUrl.substr(0, 1) == '.')
          importUrl = convertURIBase(importUrl, fileUrl, pathname);

        importUrls.push(importUrl);
        importIndex.push(importRegEx.lastIndex - match[0].length);
        importLength.push(match[0].length);
      }

      // load the import stylesheets and substitute into the css
      var completeCnt = 0;
      for (var i = 0; i < importUrls.length; i++)
        (function(i) {
          loadCSS(importUrls[i], function(importCSS) {
            css = css.substr(0, importIndex[i]) + importCSS + css.substr(importIndex[i] + importLength[i]);
            var lenDiff = importCSS.length - importLength[i];
            for (var j = i + 1; j < importUrls.length; j++)
              importIndex[j] += lenDiff;
            completeCnt++;
            if (completeCnt == importUrls.length) {
              callback(css);
            }
          });
        })(i);

      if (importUrls.length == 0)
        callback(css);
    });
  }
  
  cssAPI.load = function(cssId, req, load, config, parse) {
    var instantCallback = instantCallbacks[cssId];
    if (instantCallback)
      delete instantCallbacks[cssId];
    
    var fileUrl = cssId;
    
    if (fileUrl.substr(fileUrl.length - 4, 4) != '.css' && !parse)
      fileUrl += '.css';
    
    fileUrl = req.toUrl(fileUrl);
    
    //external url -> add as a <link> tag to load. onload support not reliable so not provided
    if (fileUrl.substr(0, 7) == 'http://' || fileUrl.substr(0, 8) == 'https://') {
      if (parse)
        throw 'Cannot preprocess external css.';
      var link = document.createElement('link');
      link.type = 'text/css';
      link.rel = 'stylesheet';
      link.href = fileUrl;
      head.appendChild(link);
      
      //only instant callback due to onload not being reliable
      load(cssAPI);
    }
    //internal url -> download and inject into <style> tag
    else {
      loadCSS(fileUrl, function(css) {
        // run parsing last - since less is a CSS subset this works fine
        if (parse)
          css = parse(css);

        cssAPI.inject(css);

        if (!instantCallback)
          load(cssAPI);
      });

      if (instantCallback)
        load(cssAPI);
    }
  }
  
  return cssAPI;
});
