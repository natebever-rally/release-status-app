Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',

    launch: function() {

        const timeScope = this.getContext().getTimeboxScope();

        if (!timeScope) {
            this.releasecombo = this.add({
                xtype: 'rallyreleasecombobox', 
                listeners: {
                    scope: this,
                    select: this._onReleaseChange,
                    ready: this._onReleaseChange
                }
            });
        }
        else {
            this.onTimeboxScopeChange();
        }
    },

    loadData: async function(model, stateField, fetchFields, doneStates) {

        Ext.getBody().mask('Loading...');

        const store = Ext.create('Rally.data.wsapi.Store', {
            model: model,
            fetch: fetchFields,
            limit: Infinity,
            filters: [
                this.timeboxFilters
            ]
        });

        const items = await store.load();

        Ext.getBody().unmask();
        return this.reduceToFinishedItems(items, stateField, doneStates);
    },

    loadAllData: async function() {

        const defectSummary = await this.loadData('Defect', 'State', ['PlanEstimate', 'State'], ['Closed']);
        const storySummary = await this.loadData('HierarchicalRequirement', 'ScheduleState', ['PlanEstimate', 'ScheduleState'], ['Accepted', 'Released']);
        const testSetSummary = await this.loadData('TestSet', 'ScheduleState', ['PlanEstimate', 'ScheduleState'], ['Accepted', 'Released']);

        const stats = {
            defects: defectSummary,
            stories: storySummary,
            testSets: testSetSummary
        };

        console.log(stats);

        this.drawScreen(stats);
    },

    reduceToFinishedItems: function(items, stateField, doneStates) {

        const finishedItems =  items.reduce((currentCount, item) => {
            const data = item.data;
            
            const getNumericalValue = (value) => {
                return isNaN(value) || value.length === 0 ? 0 : value;
            };

            const pointValue = parseFloat(data.PlanEstimate);
            const points = isNaN(pointValue) ? 0 : pointValue;

            const taskActuals = getNumericalValue(data.TaskActualTotal);
            const taskEstimates = getNumericalValue(data.TaskEstimateTotal);
            const taskTodos = getNumericalValue(data.TaskRemainingTotal);

            const newState = {
                ...currentCount, 
                totalPoints: currentCount.totalPoints + points, 
                totalCount: currentCount.totalCount + 1,
                taskActuals: currentCount.taskActuals + taskActuals,
                taskEstimates: currentCount.taskEstimates + taskEstimates,
                taskTodo: currentCount.taskTodo + taskTodos
            };

            if (doneStates.includes(data[stateField])) {
                newState.points = currentCount.points + points;
                newState.count = currentCount.count + 1;
            }
            return newState;
        }, {points: 0, count: 0, totalPoints: 0, totalCount: 0, taskActuals: 0, taskEstimates: 0, taskTodo: 0});

        return finishedItems;
    },

    onTimeboxScopeChange: function(newScope) {
        const timeScope = (!newScope) ? this.getContext().getTimeboxScope() : newScope;
        this.timeboxFilters = timeScope.getQueryFilter();
        this.release = timeScope.getRecord();
        this.cleanHtml();
        this.loadAllData();
    },

    _onReleaseChange: function() {

        this.timeboxFilters = this.releasecombo.getQueryFromSelected();
        this.release = this.releasecombo.getRecord();
        this.cleanHtml();

        this.loadAllData();
    },

    createElement: function(tag, text, classes, id) {

        const elem = document.createElement(tag);

        if (classes) {
            elem.setAttribute('class', classes);
        }

        if (id) {
            elem.setAttribute('id', id);
        }

        if (text) {
            elem.textContent = text;
        }

        return elem;
    },

    drawScreen: function(stats) {

        const body = Ext.getBody();
        const mainDiv = body.query('div span div')[0];
        
        const contentDiv = this.createElement('div', '', '', 'main-box');
        mainDiv.appendChild(contentDiv);

        const { defects, testSets, stories } = stats;

        const points = defects.points + testSets.points + stories.points;
        const totalPoints = defects.totalPoints + testSets.totalPoints + stories.totalPoints;
        const count = defects.count + testSets.count + stories.count;
        const totalCount = defects.totalCount + testSets.totalCount + stories.totalCount;

        const releaseName = this.createElement('div', this.release.data.Name, 'label center pad');
        contentDiv.appendChild(releaseName);
        const dateText = `${this.release.data.formattedStartDate} - ${this.release.data.formattedEndDate}`;
        const dateDiv = this.createElement('div', dateText, 'center');
        contentDiv.appendChild(dateDiv);

        const statusContainer = this.createElement('div', '', 'row space');
        contentDiv.appendChild(statusContainer);

        this.drawStatusBox(statusContainer, 'Points', points, totalPoints);
        this.drawStatusBox(statusContainer, 'Count', count, totalCount);

        //task stuff
        const fieldGenerator = (label, value) => {
            const containerDiv = this.createElement('div', '', 'row center tasks');
            const labelDiv = this.createElement('label', label, 'right small-label');
            const valueDiv = this.createElement('div', value + '', 'left value');
            containerDiv.appendChild(labelDiv);
            containerDiv.appendChild(valueDiv);
            return containerDiv;
        };

        const actualDiv = fieldGenerator('Task Actuals:', defects.taskActuals + testSets.taskActuals + stories.taskActuals);
        const estimateDiv = fieldGenerator('Task Estimates:', defects.taskEstimates + testSets.taskEstimates + stories.taskEstimates);
        const todoDiv = fieldGenerator('Task Todo:', defects.taskTodo + testSets.taskTodo + stories.taskTodo);

        const taskDiv = this.createElement('div', '', 'row center-justify pad');
        taskDiv.appendChild(actualDiv);
        taskDiv.appendChild(estimateDiv);
        taskDiv.appendChild(todoDiv);

        contentDiv.appendChild(taskDiv);
    },

    drawStatusBox: function(parent, label, part, total) {
        const SIZE = 80;
        const OFFSET = 10;

        const div = this.createElement('div', '', 'stat-box center');
        parent.appendChild(div);
        
        const labelDiv = this.createElement('div', label, 'center label');
        div.appendChild(labelDiv);

        const chartDiv = this.createProgressMeter(SIZE, OFFSET, part, total);
        const circleDiv = this.createCircleDiv(SIZE, OFFSET);
        const svgDiv = this.createElement('div', '', 'center', 'svg-div');
        div.appendChild(svgDiv);

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', SIZE);
        svg.setAttribute('height', SIZE);

        svg.appendChild(circleDiv);
        svg.appendChild(chartDiv);
        svgDiv.appendChild(svg);

        const done = (part === 0) ? 0 : Math.floor((part/total) * 100);
        const pointsSummaryDiv = this.createElement('div', `${part}/${total} Finished`, 'center summary');
        const percentDoneDiv = this.createElement('div', `${done}%`, 'percent');
        div.appendChild(pointsSummaryDiv);
        div.appendChild(percentDoneDiv);
    },

    calculateUnrefiendValues: function(RADIUS, percent) {
        
        const theta = percent * (2*Math.PI);

        return {
            theta, 
            x: RADIUS * Math.cos(theta),
            y: RADIUS * Math.sin(theta)
        };
    },

    createCircleDiv: function(SIZE, OFFSET) {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('r', (SIZE / 2));
        circle.setAttribute('cx', (SIZE/2) + OFFSET);
        circle.setAttribute('cy', (SIZE/2) + OFFSET);
        circle.setAttribute('stroke', 'lightgray');
        circle.setAttribute('fill', 'none');
        circle.setAttribute('stroke-width', 3);
        return circle;
    },

    createProgressMeter: function(SIZE, OFFSET, part, total) {

        if (part === total) {
            return this.createDoneCircle(SIZE, OFFSET);
        }

        return this.createPartialDoneCircle(SIZE, OFFSET, part, total);
    },

    createDoneCircle: function(SIZE, OFFSET) {
        
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('r', (SIZE / 2));
        circle.setAttribute('cx', (SIZE/2) + OFFSET);
        circle.setAttribute('cy', (SIZE/2) + OFFSET);
        circle.setAttribute('stroke', '#57c282');
        circle.setAttribute('fill', 'none');
        circle.setAttribute('stroke-width', 8);
        return circle;
    },

    createPartialDoneCircle: function(SIZE, OFFSET, part, total) {
        const RADIUS = SIZE / 2;
        const ratio = (part / total);
        const {theta, x, y} = this.calculateUnrefiendValues(RADIUS, ratio);

        const {mX, mY, longSweep} = this.modifyArcCoordinates(RADIUS, OFFSET, theta, x, y);

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${OFFSET} ${OFFSET + RADIUS} A ${RADIUS} ${RADIUS} 0 ${longSweep} 1 ${mX} ${mY}`);
        path.setAttribute('stroke', '#5691f0');
        path.setAttribute('stroke-width', 8);
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('fill', 'none');

        return path;
    },


    isQuadrant: function(theta, quad /*1-4*/) {

        const HALF_PI = Math.PI / 2;
        return (theta >= (quad - 1) * HALF_PI && theta < (quad * HALF_PI));
    },

    cleanHtml: function() {
        const mainDiv = Ext.get('main-box');

        if (mainDiv) {
            const parent = mainDiv.dom.parentNode;
            parent.removeChild(mainDiv.dom);
        }
    },

    modifyArcCoordinates: function(RADIUS, OFFSET, theta, x, y) {

        if (this.isQuadrant(theta, 1)) {
            return this.modifyQ1(RADIUS, OFFSET, x, y);
        }
        else if (this.isQuadrant(theta, 2)) {
            return this.modifyQ2(RADIUS, OFFSET, x, y);
        }
        else if (this.isQuadrant(theta, 3)) {
            return this.modifyQ3(RADIUS, OFFSET, x, y);
        }
        else {
            return this.modifyQ4(RADIUS, OFFSET, x, y);
        }
    },

    modifyQ1: function(RADIUS, OFFSET, x, y) {
        return {
            mX: RADIUS - x + OFFSET,
            mY: RADIUS - y + OFFSET,
            longSweep: 0
        };
    },

    modifyQ2: function(RADIUS, OFFSET, x, y) {
        return {
            mX: ((x - RADIUS) * -1) + OFFSET,
            mY: RADIUS - y + OFFSET,
            longSweep: 0
        };
    },

    modifyQ3: function(RADIUS, OFFSET, x, y) {
        return {
            mX: ((x - RADIUS) * -1) + OFFSET,
            mY: ((y - RADIUS) * -1) + OFFSET,
            longSweep: 1
        };
    },

    modifyQ4: function(RADIUS, OFFSET, x, y) {
        return {
            mX: RADIUS - x + OFFSET,
            mY: ((y - RADIUS) * -1) + OFFSET,
            longSweep: 1
        };
    }
});
