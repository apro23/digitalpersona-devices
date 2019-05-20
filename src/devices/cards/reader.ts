﻿import { Handler, MultiCastEventSource } from '../../private';
import { Command, Request, Channel } from '../websdk';
import { Event, CommunicationFailed, CommunicationEventSource } from '../../common';
import { DeviceConnected, DeviceDisconnected, DeviceEventSource } from '../events';
import { CardInserted, CardRemoved } from './events';
import { CardsEventSource as CardsEventSource } from './eventSource';
import { Method, NotificationType, Notification, CardNotification, ReaderList, CardList } from "./messages";
import { Card } from './cards'
import { Utf8, Base64Url, Base64, Utf16 } from '@digitalpersona/core';

export class CardsReader
    extends MultiCastEventSource
    implements CommunicationEventSource, DeviceEventSource, CardsEventSource
{
    private readonly channel: Channel;

    public onDeviceConnected: Handler<DeviceConnected>;
    public onDeviceDisconnected: Handler<DeviceDisconnected>;
    public onCardInserted: Handler<CardInserted>;
    public onCardRemoved: Handler<CardRemoved>;
    public onCommunicationFailed: Handler<CommunicationFailed>;

    public on<E extends Event>(event: string, handler: Handler<E>): Handler<E> { return this._on(event, handler); }
    public off<E extends Event>(event?: string, handler?: Handler<E>): this { return this._off(event, handler); }

    constructor(options?: WebSdk.WebChannelOptions) {
        super();
        this.channel = new Channel("smartcards", options);
        this.channel.onCommunicationError = this.onConnectionFailed.bind(this);
        this.channel.onNotification = this.processNotification.bind(this);
    }

    public enumerateReaders(): Promise<string[]> {
        return this.channel.send(new Request(new Command(
            Method.EnumerateReaders
        )))
        .then(response => {
            const list: ReaderList = JSON.parse(Utf8.fromBase64Url(response.Data || "{}"));
            return JSON.parse(list.Readers || "[]");
        })
    }

    public enumerateCards(): Promise<Card[]> {
        return this.channel.send(new Request(new Command(
            Method.EnumerateCards
        )))
        .then(response => {
            const list: CardList = JSON.parse(Utf8.fromBase64Url(response.Data || "{}"))
            const cards: string[] = JSON.parse(list.Cards || "[]");
            return cards.map(s => JSON.parse(Utf16.fromBase64Url(s)));
        });
    }

    public getCardInfo(reader: string): Promise<Card|null> {
        return this.channel.send(new Request(new Command(
            Method.GetCardInfo,
            Base64Url.fromJSON({ Reader: reader })
        )))
        .then(response => {
            const cardInfo: Card = JSON.parse(Utf8.fromBase64Url(response.Data || "null"));
            return cardInfo;
        });
    }

    public getCardUid(reader: string): Promise<string> {
        return this.channel.send(new Request(new Command(
            Method.GetCardUID,
            Base64Url.fromJSON({ Reader: reader })
        )))
        .then(response => {
            const data = Base64.fromBase64Url(response.Data || "");
            return data;
        });
    }

    public getCardAuthData(reader: string, pin?: string): Promise<string> {
        return this.channel.send(new Request(new Command(
            Method.GetDPCardAuthData,
            Base64Url.fromJSON({ Reader: reader, PIN: pin || "" })
        )))
        .then(response => {
            const data = JSON.parse(Utf8.fromBase64Url(response.Data || ""));
            return data;
        });
    }

    public getCardEnrollData(reader: string, pin?: string): Promise<string> {
        return this.channel.send(new Request(new Command(
            Method.GetDPCardEnrollData,
            Base64Url.fromJSON({ Reader: reader, PIN: pin || "" })
        )))
        .then(response => {
            const data = JSON.parse(Utf8.fromBase64Url(response.Data || ""));
            return data;
        });
    }

    public subscribe(reader?: string): Promise<void> {
        return this.channel.send(new Request(new Command(
            Method.Subscribe,
            reader ? Base64Url.fromJSON({ Reader: reader }) : ""
        )))
        .then(()=>{});
    }

    public unsubscribe(reader?: string): Promise<void> {
        return this.channel.send(new Request(new Command(
            Method.Unsubscribe,
            reader ? Base64Url.fromJSON({ Reader: reader }) : ""
        )))
        .then(()=>{});
    }

    private onConnectionFailed(): void {
        this.emit(new CommunicationFailed());
    }

    private processNotification(notification: Notification): void {
        switch(notification.Event) {
            case NotificationType.ReaderConnected:
                return this.emit(new DeviceConnected(notification.Reader));
            case NotificationType.ReaderDisconnected:
                return this.emit(new DeviceDisconnected(notification.Reader));
            case NotificationType.CardInserted:
                return this.emit(new CardInserted(notification.Reader, (notification as CardNotification).Card));
            case NotificationType.CardRemoved:
                return this.emit(new CardRemoved(notification.Reader, (notification as CardNotification).Card));
            default:
                console.log(`Unknown notification: ${notification.Event}`)
        }
    }

}

