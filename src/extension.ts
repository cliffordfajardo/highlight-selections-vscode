
'use strict'
import { commands, ExtensionContext, window, workspace, Range, Position, OverviewRulerLane} from 'vscode'
const debounce = require('lodash.debounce');
const escapeStringRegExp = require('escape-string-regexp');


export async function activate(context: ExtensionContext) {
    toggleNativeFeatures(userEditorSettings)
    /*NOTE: we should only create 1 declaration type object once, as done here.
      If we recreate it in 'updateDecorations' each time, when we removeDecorations,
      they will reference diff objects.
    */
    let fullDecorationType = getDecorationTypeFromConfig({top: true, right: true, bottom: true, left: true })
    let decorationTypesMap = new Map([
        [fullDecorationType, []]
    ]);

    let activeEditor = window.activeTextEditor;
    let lastSelectionText = '';
    let debounced_updateDecorations = debounce(updateDecorations, 350);


    /**
     * This is required. When we create a new tab in our editor, we want
     * to update the activeEditor.
     */
    window.onDidChangeActiveTextEditor(() => {
        if (activeEditor) return;
        activeEditor = window.activeTextEditor;
    })

    /**
     * Any time we move anywhere around our editor, we want to trigger
     * a decoration.
     */
    let handleSelectionChange = () => {
        const isMultiLineSelection = activeEditor.selection.isSingleLine === true ? false: true;
        if(isMultiLineSelection) return;

        //reset decorations on empty selection
        if (window.activeTextEditor.selection.isEmpty) {
            window.visibleTextEditors.forEach((editor) => {
                decorationTypesMap.set(fullDecorationType, [])
                editor.setDecorations(fullDecorationType, [])
            })
            lastSelectionText = getActiveEditorSelectionText();
            return;
        }
        //single line selection
        activeEditor = window.activeTextEditor;
        debounced_updateDecorations({ isMultiLineSelection: false });
    }

    window.onDidChangeTextEditorSelection(handleSelectionChange)



    function updateDecorations({updateAllVisibleEditors, isMultiLineSelection}) {
        const currentSelectionText = getActiveEditorSelectionText();
        const selectionContainsSpecialChars = /[^[A-Za-z[0-9]/.test(currentSelectionText);
        const selectionIsSubstring = getWordFromSubstringSelection().includes(currentSelectionText) && currentSelectionText.length < getWordFromSubstringSelection().length;

        let lines = [];
        if(currentSelectionText.length < 2) return;


        //remove decorations if updating & overlapping (for single selections)
        if (currentSelectionText.includes(lastSelectionText) || lastSelectionText.includes(currentSelectionText)) {
            window.visibleTextEditors.forEach((editor) => {
                decorationTypesMap.set(fullDecorationType, [])
                editor.setDecorations(fullDecorationType, [])
            })
        }


        //single line selection

        let regexPattern;
        let wholeWorldPattern;
        let nonWholeWorldPattern;
        let decorationType = fullDecorationType;

        if (selectionContainsSpecialChars || selectionIsSubstring) {
            nonWholeWorldPattern = `${escapeStringRegExp(currentSelectionText)}`
            regexPattern = nonWholeWorldPattern;
        } else {
            wholeWorldPattern = `\\b${escapeStringRegExp(currentSelectionText)}\\b`;
            regexPattern = wholeWorldPattern;
        }



        window.visibleTextEditors.forEach((editor, index) => {
            const editorText = editor.document.getText();

            const regex = new RegExp(regexPattern, 'gi');
            let match;
            while (match = regex.exec(editorText)) {
                const startPos = activeEditor.document.positionAt(match.index);
                const endPos = activeEditor.document.positionAt(match.index + match[0].length);
                const newDecoration = { range: new Range(startPos, endPos) };
                decorationTypesMap.get(decorationType).push(newDecoration)
            }
            //loop over our map & set the decorations
            decorationTypesMap.forEach((decorations, decorationType) => {
                editor.setDecorations(decorationType, decorations)
            })
        });

        lastSelectionText = currentSelectionText;
    }

    workspace.onDidChangeConfiguration(() => {
        //clear all decorations
        fullDecorationType.dispose();
        fullDecorationType = getDecorationTypeFromConfig({ top: true, right: true, bottom: true, left: true });
        updateDecorations({updateAllVisibleEditors:true, isMultiLineSelection:false})
    })
}


function getActiveEditorSelectionText(){
    let activeEditor = window.activeTextEditor;
    if(!activeEditor) return;
    const selectionRange = new Range(activeEditor.selections[0].start, activeEditor.selections[0].end);
    const selectionText = activeEditor.document.getText(selectionRange);
    return selectionText;
}

function getWordFromSubstringSelection(){
    let activeEditor = window.activeTextEditor;
    if(!activeEditor) return;
    const wholeWordRange = activeEditor.document.getWordRangeAtPosition(activeEditor.selection.start)
    return activeEditor.document.getText(wholeWordRange);
}




const userEditorSettings = {
    occurencesHighlight: workspace.getConfiguration('editor').get('occurrencesHighlight'),
    selectionHighlight: workspace.getConfiguration('editor').get('selectionHighlight')
}

// this method is called when your extension is deactivated
export function deactivate() {
    toggleNativeFeatures(userEditorSettings, true);
}












//UTILITIES
function getDecorationTypeFromConfig({top, right, bottom, left}) {
    const config = workspace.getConfiguration("highlightSelections")
    const borderColor = config.get("borderColor");
    const borderStyle = config.get("borderStyle");
    let borderWidth = config.get("borderWidth");

    //highlight all border edges
    if (top && right && bottom && left) {
        borderWidth = `${borderWidth}`
    }
    //highlight all but the bottom. (Use case: Multi-line decoration: this is First Line)
    else if (top && right && left && !bottom) {
        borderWidth = `${borderWidth} ${borderWidth} 0 ${borderWidth}`
    }
    //highlight all but the top (Use case: Multi-line decoration: this is the Last Line)
    else if (right && left && bottom && !top) {
        borderWidth = `0 ${borderWidth} ${borderWidth} ${borderWidth}`;
    }
    //highlight only the sides (Use case: Multi-line decoration: this is a Middle Line)
    else if (right && left && !top && !bottom) {
        borderWidth = `0 ${borderWidth} 0 ${borderWidth}`;
    }
    const decorationType = window.createTextEditorDecorationType({
        overviewRulerLane: OverviewRulerLane.Center,
        borderWidth: `${borderWidth}`,
        borderStyle: `${borderStyle}`, //TODO: file bug, this shouldn't throw a lint error.
        borderColor
    })
    return decorationType;
}











/**
 * Turn off occurencesHighlight & selectionHighlight settings IF on.
 * If abovementioned settings are off, leave off
 */
function toggleNativeFeatures(userEditorSettings, reset=false) {
    let {occurencesHighlight, selectionHighlight} = userEditorSettings;

    if(occurencesHighlight) {
        workspace.getConfiguration().update('editor.occurrencesHighlight',false,true);
    }
    if(selectionHighlight){
        workspace.getConfiguration().update('editor.selectionHighlight', false, true);
    }

    //when the extentension is deactivated, set the settings back to their original values
    if(reset) {
        workspace.getConfiguration().update('editor.occurrencesHighlight', occurencesHighlight,true);
        workspace.getConfiguration().update('editor.occurrencesHighlight', selectionHighlight,true);
    }
}



