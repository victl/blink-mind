import {
  DocModelModifier,
  getAllSubTopicKeys,
  OpType,
  BlockType,
  FocusMode
} from '@blink-mind/core';
import debug from 'debug';
import {
  collapseRefKey,
  contentEditorRefKey,
  contentRefKey,
  descEditorRefKey,
  dropAreaRefKey,
  linksRefKey,
  linksSvgRefKey,
  topicNodeRefKey,
  topicWidgetRefKey,
  topicWidgetRootRefKey
} from '../utils';
const log = debug('plugin:operation');

export function OperationPlugin() {
  const {
    addSheet,
    setCurrentSheet,
    duplicateSheet,
    deleteSheet,
    setSheetTitle,

    addChild,
    addSibling,
    toggleCollapse,
    collapseAll,
    expandAll,
    expandTo,
    focusTopic,
    setFocusMode,
    deleteTopic,
    setTopicBlockData,
    setTopicBlockContentData,
    deleteTopicBlock,
    setStyle,
    clearAllCustomStyle,
    setTheme,
    setConfig,
    setLayoutDir,
    setEditorRootTopicKey,
    startEditingContent,
    startEditingDesc,
    dragAndDrop
  } = DocModelModifier;
  const OpMap = new Map([
    [OpType.ADD_SHEET, addSheet],
    [OpType.SET_CURRENT_SHEET, setCurrentSheet],
    [OpType.DELETE_SHEET, deleteSheet],
    [OpType.DUPLICATE_SHEET, duplicateSheet],
    [OpType.SET_SHEET_TITLE, setSheetTitle],

    [OpType.TOGGLE_COLLAPSE, toggleCollapse],
    [OpType.COLLAPSE_ALL, collapseAll],
    [OpType.EXPAND_ALL, expandAll],
    [OpType.EXPAND_TO, expandTo],
    [OpType.ADD_CHILD, addChild],
    [OpType.ADD_SIBLING, addSibling],
    [OpType.DELETE_TOPIC, deleteTopic],
    [OpType.FOCUS_TOPIC, focusTopic],
    [OpType.SET_FOCUS_MODE, setFocusMode],
    [OpType.SET_STYLE, setStyle],
    [OpType.CLEAR_ALL_CUSTOM_STYLE, clearAllCustomStyle],

    [OpType.SET_CONFIG, setConfig],
    [OpType.SET_THEME, setTheme],
    [OpType.SET_TOPIC_BLOCK, setTopicBlockData],
    [OpType.SET_TOPIC_BLOCK_CONTENT, setTopicBlockContentData],
    [OpType.DELETE_TOPIC_BLOCK, deleteTopicBlock],
    [OpType.START_EDITING_CONTENT, startEditingContent],
    [OpType.START_EDITING_DESC, startEditingDesc],
    [OpType.DRAG_AND_DROP, dragAndDrop],
    [OpType.SET_EDITOR_ROOT, setEditorRootTopicKey],
    [OpType.SET_LAYOUT_DIR, setLayoutDir]
  ]);

  let enabled = true;
  let whiteListOperation = new Set<string>();

  return {
    isOperationEnabled(props) {
      return enabled;
    },

    enableOperation() {
      enabled = true;
    },

    disableOperation({ whiteList }) {
      enabled = false;
      if (whiteList) whiteListOperation = new Set(whiteList);
      else whiteListOperation.clear();
    },

    /** plugin can extend Operation Map
     * for example: A plugin can write a function
     * getOpMap(ctx,next) {
     *   let opMap = next();
     *   opMap.set("OpTypeName",opFunc);
     *   return opMap;
     * }
     * @param ctx
     */
    getOpMap(ctx) {
      return OpMap;
    },

    customizeAllowUndo(ctx) {
      const { docModel, opType } = ctx;
      const model = docModel.currentSheetModel;
      if (opType) {
        switch (opType) {
          // 这几种情况不加入undo 队列
          case OpType.FOCUS_TOPIC:
          case OpType.SET_FOCUS_MODE:
          case OpType.START_EDITING_CONTENT:
            return false;
          case OpType.START_EDITING_DESC:
            return !model.currentFocusTopic.getBlock(BlockType.DESC).block;
          case OpType.SET_TOPIC_BLOCK_CONTENT:
            return false;
          default:
            break;
        }
      }
      if (model.focusMode === FocusMode.EDITING_DESC) return false;
      return model.config.allowUndo;
    },

    //TODO 有空重构这个函数
    operation(ctx) {
      if (ctx.controller.docModel) {
        ctx = {
          ...ctx,
          docModel: ctx.controller.docModel,
          model: ctx.controller.docModel.currentSheetModel
        };
      }
      const { controller, opType, docModel, opArray, callback } = ctx;
      if (opArray != null && !Array.isArray(opArray)) {
        throw new Error('operation: the type of opArray must be array!');
      }
      if (opType != null && opArray != null) {
        throw new Error('operation: opType and opArray conflict!');
      }
      const isOperationEnabled = controller.run('isOperationEnabled', ctx);
      if (!isOperationEnabled) {
        // warning(
        //   true,
        //   `You have disabled operation,but you run operation ${props} now!`
        // );
        if (whiteListOperation.size === 0) return;

        if (opArray != null) {
          const opNotInWhiteList = opArray.filter(
            op => !whiteListOperation.has(op.opType)
          );
          if (opNotInWhiteList && opNotInWhiteList.length > 0) {
            return;
          }
        } else if (!whiteListOperation.has(opType)) {
          return;
        }
      }

      log('operation:', opType || opArray.map(op => op.opType), ctx);
      if (opType === OpType.SET_TOPIC_BLOCK) {
        log(ctx.blockType, ctx.data);
      }
      // log('operation:', ctx);

      const opMap = controller.run('getOpMap', ctx);
      controller.run('beforeOperation', ctx);
      if (controller.run('getAllowUndo', ctx)) {
        const { undoStack } = controller.run('getUndoRedoStack', ctx);
        controller.run('setUndoStack', {
          ...ctx,
          undoStack: undoStack.push(docModel)
        });
      }
      let newDocModel;

      if (opArray != null) {
        newDocModel = opArray.reduce((acc, cur) => {
          const { opType } = cur;
          if (!opMap.has(opType))
            throw new Error(`opType:${opType} not exist!`);
          const opFunc = opMap.get(opType);
          const opFuncProps = { controller, ...cur, docModel: acc };
          let res = controller.run('beforeOpFunction', opFuncProps);
          res = opFunc({ ...opFuncProps, docModel: res });
          res = controller.run('afterOpFunction', {
            ...opFuncProps,
            docModel: res
          });
          return res;
        }, docModel);
      } else {
        if (!opMap.has(opType)) throw new Error(`opType:${opType} not exist!`);
        const opFunc = opMap.get(opType);
        newDocModel = controller.run('beforeOpFunction', ctx);
        newDocModel = opFunc({ ...ctx, docModel: newDocModel });
        newDocModel = controller.run('afterOpFunction', {
          ...ctx,
          docModel: newDocModel
        });
      }
      // log(
      //   'newDocModel:',
      //   newDocModel,
      //   newDocModel.currentSheetModel.focusKey,
      //   //TODO currentFocusTopic可能为空
      //   newDocModel.currentSheetModel.currentFocusTopic &&
      //     newDocModel.currentSheetModel.currentFocusTopic.contentData
      // );
      controller.change(newDocModel, callback ? callback(newDocModel) : null);
      controller.run('afterOperation', ctx);
      log(controller.docModel.currentSheetModel.topics);
    },

    deleteRefKey(ctx) {
      // const { model, topicKey, deleteRef } = ctx;
      // const allSubKeys = getAllSubTopicKeys(model, topicKey);
      // allSubKeys.push(topicKey);
      // for (const key of allSubKeys) {
      //   deleteRef(linksRefKey(key));
      //   deleteRef(linksSvgRefKey(key));
      //   deleteRef(contentRefKey(key));
      //   deleteRef(contentEditorRefKey(key));
      //   deleteRef(descEditorRefKey(key));
      //   deleteRef(topicWidgetRefKey(key));
      //   deleteRef(topicWidgetRootRefKey(key));
      //   deleteRef(topicNodeRefKey(key));
      //   deleteRef(collapseRefKey(key));
      //   deleteRef(dropAreaRefKey(key, 'next'));
      //   deleteRef(dropAreaRefKey(key, 'prev'));
      // }
    },

    // 在整个Operation执行之前被调用
    beforeOperation(props) {},
    afterOperation(props) {},

    // 在单个OpFunction执行之前被调用
    beforeOpFunction(ctx) {
      const { docModel } = ctx;
      return docModel;
    },

    afterOpFunction(ctx) {
      return ctx.docModel;
    },

    openNewDocModel(ctx) {
      const { docModel, controller, newDocModel } = ctx;
      // TODO 后面会采用新的RefKey策略
      // controller.run('deleteRefKey', {
      //   ...ctx,
      //   topicKey: docModel.rootTopicKey
      // });
      controller.run('operation', {
        ...ctx,
        opType: OpType.EXPAND_TO,
        model: newDocModel.currentSheetModel,
        topicKey: newDocModel.currentSheetModel.focusKey,
        docModel: newDocModel,
        callback: docModel => () => {
          controller.run('moveTopicToCenter', {
            ...ctx,
            docModel,
            topicKey: docModel.currentSheetModel.focusKey
          });
        }
      });
    }
  };
}
