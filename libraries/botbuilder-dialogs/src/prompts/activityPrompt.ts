/**
 * @module botbuilder-dialogs
 */
/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { TurnContext, Activity, InputHints } from 'botbuilder-core';
import { DialogContext } from '../dialogContext';
import { Dialog, DialogTurnResult, DialogInstance, DialogReason } from '../dialog';
import { PromptValidator, PromptOptions, PromptRecognizerResult } from './prompt';

/**
 * Base class for all prompts.
 */
export abstract class ActivityPrompt extends Dialog {
    constructor(dialogId: string, private validator: PromptValidator<Activity>) { 
        super(dialogId);
    }

    protected async onPrompt(context: TurnContext, state: object, options: PromptOptions): Promise<void> {
        if (options.prompt) {
            await context.sendActivity(options.prompt, undefined, InputHints.ExpectingInput);
        }
    }
    
    protected async onRecognize(context: TurnContext, state: object, options: PromptOptions): Promise<PromptRecognizerResult<Activity>> {
        return { succeeded: true, value: context.activity };
    }

    public async dialogBegin(dc: DialogContext, options: PromptOptions): Promise<DialogTurnResult> {
        // Ensure prompts have input hint set
        const opt = Object.assign({}, options);
        if (opt.prompt && typeof opt.prompt === 'object' && typeof opt.prompt.inputHint !== 'string') {
            opt.prompt.inputHint = InputHints.ExpectingInput;
        }
        if (opt.retryPrompt && typeof opt.retryPrompt === 'object' && typeof opt.retryPrompt.inputHint !== 'string') {
            opt.retryPrompt.inputHint = InputHints.ExpectingInput;
        }

        // Initialize prompt state
        const state = dc.activeDialog.state as ActivityPromptState;
        state.options = opt;
        state.state = {};

        // Send initial prompt
        await this.onPrompt(dc.context, state.state, state.options);
        return Dialog.EndOfTurn;
    }

    public async dialogContinue(dc: DialogContext): Promise<DialogTurnResult> {
        // Perform base recognition
        const state = dc.activeDialog.state as ActivityPromptState;
        const recognized = await this.onRecognize(dc.context, state.state, state.options);
        
        // Validate the return value
        let end = false;
        let endResult: any;
        await this.validator(dc.context, {
            recognized: recognized,
            state: state.state,
            options: state.options,
            end: (output: any) => {
                if (end) { throw new Error(`PromptValidatorContext.end(): method already called for the turn.`) }
                end = true;
                endResult = output;
            }
        });

        // Return recognized value or re-prompt
        if (end) {
            return await dc.end(endResult);
        } else {
            return Dialog.EndOfTurn;
        }
    }

    public async dialogResume(dc: DialogContext, reason: DialogReason, result?: any): Promise<DialogTurnResult> {
        // Prompts are typically leaf nodes on the stack but the dev is free to push other dialogs
        // on top of the stack which will result in the prompt receiving an unexpected call to
        // dialogResume() when the pushed on dialog ends. 
        // To avoid the prompt prematurely ending we need to implement this method and 
        // simply re-prompt the user.
        await this.dialogReprompt(dc.context, dc.activeDialog);
        return Dialog.EndOfTurn;
    }

    public async dialogReprompt(context: TurnContext, instance: DialogInstance): Promise<void> {
        const state = instance.state as ActivityPromptState;
        await this.onPrompt(context, state.state, state.options);
    }
}

interface ActivityPromptState {
    state: object;
    options: PromptOptions;
}