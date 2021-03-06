/**
 * Copyright (c) 2016, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
 *
 * WSO2 Inc. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

DataMapper.Views.AnchorView = Backbone.View.extend({
    el: ".drag-head",
    initialize: function () {
        this.model.drawArrow();
    }
});
DataMapper.Models.Anchor = Backbone.Model.extend({
    defaults: {
        parent: d3.select(Diagram.Canvas.el),
        cx: 0,
        cy: 0,
        width: 10,
        height: 10,
        points: "",
        type: "input"
    },
    dragAnchor: function () {
        var self = this;
        return d3.drag()
            .on("start", function (d) {
                var thisDragY = d3.select(this).attr("cy");
                var thisDragX = d3.select(this).attr("cx");
                var tempParent = d3.select(d3.select(this)["_groups"][0][0].parentNode);
                dragHead2 = self.drawDragArrow(tempParent, thisDragX, thisDragY);
                connector = new DataMapper.Models.Connector();
                connectorView = new DataMapper.Views.ConnectorView({
                    parent: tempParent,
                    model: connector
                });
                dragLine = connectorView.render();
                // connector.setPoints(thisDragX,thisDragY,thisDragX,thisDragY);
                dragLine.attr("x1", thisDragX)
                    .attr("x2", thisDragX)
                    .attr("y1", thisDragY)
                    .attr("y2", thisDragY);
            })
            .on("drag", function (d) {
                coordinates = d3.mouse(this);
                xx = coordinates[0];
                yy = coordinates[1];
                dragLine.attr("x2", xx)
                    .attr("y2", yy);
                self.moveArrow(dragHead2, xx, yy);
            })
            .on("end", function (d) {
                var sourceContainer = self.getParentContainer(d3.select(this));
                var sourceNode = d3.select(d3.select(this)["_groups"][0][0].parentNode);
                target = self.detectDropNode(xx, yy, sourceNode.attr("type"), sourceContainer);
                //find backend nodes
                var backendSourceNode, backendTargetNode;
                if (target) {
                    var findNodes = (function (sNode, tNode) {
                        Diagram.Operators.models.concat(Diagram.TreeContainers.models).map(function (model) {
                            if (!backendSourceNode) {
                                backendSourceNode = model.get('nodeCollection').getNodeFromDOMObject(sNode.node());
                            }
                            if (!backendTargetNode) {
                                backendTargetNode = model.get('nodeCollection').getNodeFromDOMObject(tNode.node());
                            }
                            if (backendSourceNode && backendTargetNode) {
                                return [backendSourceNode, backendTargetNode];
                            }
                        });
                    })(sourceNode, target);
                }

                if (target && backendSourceNode.get('textType').toLowerCase() === backendTargetNode.get('textType').toLowerCase()) {
                    //limit the connections to one - in output targets
                    if (target.attr("type") === "output") {
                        //loop through connectors to find targetNode=target and remove line
                        var duplicate = Diagram.Connectors.findFromTargetNode(target) || null;
                        if (duplicate !== null) {

                            duplicate.removeConnector();
                        }
                    }

                    var oppositeContainer = backendTargetNode.get('parentContainer');
                    sourceContainer = backendSourceNode.get('parentContainer');
                    var dotx = Number(target.select(".drag-head").attr("cx")) + self.getTranslateX(oppositeContainer.get('parent')) - self.getTranslateX(sourceContainer.get('parent'));
                    var doty = Number(target.select(".drag-head").attr("cy")) + self.getTranslateY(oppositeContainer.get('parent')) - self.getTranslateY(sourceContainer.get('parent'));
                    dragLine.attr("x2", dotx)
                        .attr("y2", doty);
                    // .attr("target-dmcontainer", oppositeContainer.attr("id"));
                    dragHead2.remove();
                    connector.set("targetContainer", oppositeContainer);
                    connector.set("targetNode", backendTargetNode);
                    connector.set("sourceContainer", sourceContainer);
                    connector.set("sourceNode", backendSourceNode);
                    connectorView.dropFunction();
                } else {
                    dragLine.remove();
                    dragHead2.remove();
                }
            });
    },
    drawArrow: function () {
        var self = this;
        var newArrow = this.get('parent').append("polygon").attr("class", "drag-head");
        this.moveArrow(newArrow, this.get('cx'), this.get('cy'));
        if (this.get('type') === "input") {
            newArrow.attr("fill", "#019999").attr("cursor", "pointer");
            newArrow.call(this.dragAnchor());
        } else {
            newArrow.attr("fill", "#7c7c7c");
        }
        var observer = new MutationObserver(function (mutations) {
            var newcx = mutations[0].target.getAttribute('cx');
            var newcy = mutations[0].target.getAttribute('cy');
            self.setPoints(newArrow, newcx, newcy);
        });

        // Start observing the circle node and listen for changes to attributes cx and cy
        // while recording old values.
        var config = {
            attributes: true,
            attributeOldValue: true,
            attributeFilter: ["cx", "cy"]
        };

        observer.observe(newArrow.node(), config);
    },
    drawDragArrow: function (parent, cx, cy) {
        var newArrow = parent.append("polygon").attr("class", "drag-head-2");
        this.moveArrow(newArrow, cx, cy);
        return newArrow;
    },
    moveArrow: function (arrow, cx, cy) {
        arrow.attr("cx", cx)
            .attr("cy", cy);
        this.setPoints(arrow, cx, cy);
    },
    setPoints: function (arrow, cx, cy) {
        arrow.attr("points", function () {
            var p0 = [Number(cx) - 5, Number(cy) - 5],
                p1 = [Number(cx) + 5, Number(cy)],
                p2 = [Number(cx) - 5, Number(cy) + 5];
            return p0[0] + "," + p0[1] + " " + p1[0] + "," + p1[1] + " " + p2[0] + "," + p2[1];
        })
    },

    detectDropNode: function (xx, yy, type, sourceContainer) { //detect if a drop is near opposite type of drag-head
        var flag = false,
            self = this;
        d3.select("#canvas").selectAll(".leaf-node").each(function () { //assuming every leaf node has an anchor
            if (!flag && d3.select(this).attr("type") === "output") {
                var nodeElement = d3.select(this);
                if (nodeElement !== null) {
                    var x = Number(nodeElement.attr("x")) + self.getTranslateX(self.getParentContainer(nodeElement)) - self.getTranslateX(sourceContainer);
                    var y = Number(nodeElement.attr("y")) + self.getTranslateY(self.getParentContainer(nodeElement)) - self.getTranslateY(sourceContainer);
                    var width = Number(nodeElement.attr("width"));
                    var height = Number(nodeElement.attr("height"));
                    // d3.select("#canvas").append("rect").attr("x", x).attr("y", y).attr("width", width).attr("height", height);
                    if (self.pointInRect([xx, yy], x, x + width, y, y + height)) {
                        flag = nodeElement;
                    }
                }
            }
        });
        return flag;
    },
    pointInRect: function (point, x1, x2, y1, y2) { //determines if the point(array of coord) is bouded by the rectangle

        if (point[0] > x1 && point[0] < x2) {
            //horizontally inside
            if (point[1] > y1 && point[1] < y2) {
                //vertically in
                return true;
            }
        }
        return false;
    },
    getTranslation: function (transform) {
        // Create a dummy g for calculation purposes only. This will never
        // be appended to the DOM and will be discarded once this function
        // returns.
        var g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        // Set the transform attribute to the provided string value.
        g.setAttributeNS(null, "transform", transform);
        // consolidate the SVGTransformList containing all transformations
        // to a single SVGTransform of type SVG_TRANSFORM_MATRIX and get
        // its SVGMatrix.
        var matrix = g.transform.baseVal.consolidate().matrix;
        // As per definition values e and f are the ones for the translation.
        return [matrix.e, matrix.f];
    },
    getTranslateX: function (sourceContainer) {
        return Number(this.getTranslation(sourceContainer.attr("transform"))[0]);
    },
    getTranslateY: function (sourceContainer) {
        return Number(this.getTranslation(sourceContainer.attr("transform"))[1]);
    },
    getParentContainer: function (nodeElement) { //a recursive method to find g.container of an element
        if (nodeElement.classed("dmcontainer")) {
            return nodeElement;
        } else {
            return this.getParentContainer(d3.select(nodeElement["_groups"][0][0].parentNode));
        }
    }
});