export class TemplatePreview {
    constructor(template, {origin, range}) {
        this.document = template;
        this.resolve = null;
        this.promise = new Promise((resolve) => (this.resolve = resolve));
        this.origin = origin;
        this.range = range;
        this.isEvenDistance = (this.document.distance / canvas.scene.dimensions.distance) % 2 === 0;
        if (this.range) this.range = range * canvas.scene.dimensions.distancePixels;
    }

    activateListeners() {
        this._onMoveFn = this.#onMove.bind(this);
        this._onMouseUpFn = this.#onMouseUp.bind(this);
        document.addEventListener("mousemove", this._onMoveFn);
        document.addEventListener("mouseup", this._onMouseUpFn);
    }

    #onMove(event) {
        let coords = canvas.canvasCoordinatesFromClient({ x: event.clientX, y: event.clientY });
        coords = [coords.x, coords.y];
        //coords = canvas.grid.getCenter(coords[0], coords[1]);
        //coords = canvas.grid.getTopLeft(coords[0], coords[1]);
        //if distance is not even, snap to center
        if (!this.isEvenDistance) {
            coords = canvas.grid.getCenter(coords[0], coords[1]);
        } else {
            const snapped = canvas.grid.getSnappedPosition(coords[0], coords[1]);
            coords = [snapped.x, snapped.y];
        }
        this.document.updateSource({x: coords[0], y: coords[1]});
        this.previewObject.x = coords[0];
        this.previewObject.y = coords[1];
    }

    #onMouseUp(event) {
        const isRightClick = event.button === 2;
        const isLeftClick = event.button === 0;
        if (!isRightClick && !isLeftClick) return;
        this.cleanup();
        this.resolve(isLeftClick ? this.document : null);
    }

    async drawPreview() {
        const previewObject = new PIXI.Container();
        previewObject.alpha = 0;
        //draw a circle with border
        const circle = new PIXI.Graphics();
        const fill = this.document.fillColor;
        const stroke = this.document.borderColor;
        circle.beginFill(fill, 0.25);
        circle.drawCircle(0, 0, (this.document.distance * canvas.dimensions.distancePixels) / 2);
        circle.endFill();

        if (this.document.texture) {
            const texture = await loadTexture(this.document.texture);
            if(texture) {
                const textureWidth = texture.width;
                const textureHeight = texture.height;
                const circleWidthHeight = (this.document.distance * canvas.dimensions.distancePixels);

                const matrix = new PIXI.Matrix();
                matrix.translate(-textureWidth/2, -textureHeight/2);
                matrix.scale(circleWidthHeight / textureWidth, circleWidthHeight / textureHeight);


                circle.beginTextureFill({texture, matrix});
                circle.drawCircle(0, 0, this.document.distance * canvas.dimensions.distancePixels / 2);
                circle.endFill();
            }
        }


        circle.lineStyle(1, stroke, 1);
        circle.drawCircle(0, 0, (this.document.distance * canvas.dimensions.distancePixels) / 2);
        previewObject.addChild(circle);
        //circle.x += circle.width / 2;
        //circle.y += circle.height / 2;
        this.previewObject = previewObject;
        canvas.interface.grid.addChild(previewObject);
        CanvasAnimation.animate(
            [
                {
                    parent: previewObject,
                    attribute: "alpha",
                    from: 0,
                    to: 1,
                }
            ],
            {
                duration: 200,
                easing: "easeInCircle",
            },
        );
        this.activateListeners();
        this.drawRangePreview();
        return this.promise;
    }

    async drawRangePreview() {
        if(!this.range || !this.origin) return;
        const previewObject = new PIXI.Container();
        previewObject.alpha = 0;
        //draw a circle with border
        const circle = new PIXI.Graphics();
        const fill = this.document.fillColor;
        const stroke = this.document.borderColor;
        circle.beginFill(fill, 0.15);
        circle.drawCircle(0, 0, this.range);
        circle.endFill();

        circle.lineStyle(1, stroke, 1);
        circle.drawCircle(0, 0, this.range);
        previewObject.addChild(circle);
        this.previewRangeObject = previewObject;
        canvas.interface.grid.addChild(previewObject);
        CanvasAnimation.animate(
            [
                {
                    parent: previewObject,
                    attribute: "alpha",
                    from: 0,
                    to: 1,
                }
            ],
            {
                duration: 200,
                easing: "easeInCircle",
            },
        );
        previewObject.x = this.origin.x;
        previewObject.y = this.origin.y;
    }

    async cleanup() {
        document.removeEventListener("mousemove", this._onMoveFn);
        document.removeEventListener("mouseup", this._onMouseUpFn);
        CanvasAnimation.animate(
            [
                {
                    parent: this.previewObject,
                    attribute: "alpha",
                    to: 0,
                },
            ],
            {
                duration: 200,
                easing: "easeOutCircle",
            },
        ).then(() => {
            this.previewObject.removeFromParent();
            this.previewObject.destroy(true);
        });

        if (this.previewRangeObject) {
            CanvasAnimation.animate(
                [
                    {
                        parent: this.previewRangeObject,
                        attribute: "alpha",
                        to: 0,
                    },
                ],
                {
                    duration: 200,
                    easing: "easeOutCircle",
                },
            ).then(() => {
                this.previewRangeObject.removeFromParent();
                this.previewRangeObject.destroy(true);
            });
        }
    }
}
